import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";

export const useTaskSocket = (userRole, userId) => {
    const socketRef = useRef(null);
    const [connectionStatus, setConnectionStatus] = useState("disconnected");
    const [notifications, setNotifications] = useState([]);
    const isUploadingRef = useRef(false);
    const pollingIntervalRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    // Check if upload/recording is in progress
    const isOperationInProgress = useCallback(() => {
        return isUploadingRef.current || sessionStorage.getItem("isUploading") === "true";
    }, []);

    // Pause polling
    const pausePolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
            console.log("[Socket] Polling paused for upload");
        }
    }, []);

    // Resume polling with callback
    const resumePolling = useCallback((pollFn) => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }
        pollingIntervalRef.current = setInterval(pollFn, 10000);
        console.log("[Socket] Polling resumed");
    }, []);

    useEffect(() => {
        // Don't reconnect if upload is in progress
        if (isOperationInProgress()) {
            console.log("Upload in progress, skipping socket reconnect");
            return;
        }

        // Connect to appropriate namespace
        const namespace = userRole === "admin" ? "/admin-tasks" : "/employee-tasks";
        
        socketRef.current = io("http://localhost:5000", {
            path: "/socket.io/",
            auth: {
                token: localStorage.getItem("token")
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        const socket = socketRef.current;

        socket.on("connect", () => {
            console.log(`[${userRole}] Connected to socket with ID: ${socket.id}`);
            setConnectionStatus("connected");
            
            // Join appropriate rooms
            if (userRole === "admin") {
                socket.emit("subscribe_conflicts");
            } else {
                socket.emit("join_user_tasks", userId);
            }
        });

        socket.on("disconnect", () => {
            console.log(`[${userRole}] Disconnected from socket`);
            // Don't update status if upload in progress
            if (!isOperationInProgress()) {
                setConnectionStatus("disconnected");
            }
        });

        // Listen for notifications
        socket.on("new_conflict", (data) => {
            addNotification("warning", `Conflict flagged: ${data.inconsistency.type}`, data);
        });

        socket.on("task_assigned", (data) => {
            addNotification("info", `New task assigned: ${data.taskDetails?.taskName}`, data);
        });

        socket.on("task_status_changed", (data) => {
            addNotification("info", `Task status changed to ${data.newStatus}`, data);
        });

        socket.on("conflict_resolved", (data) => {
            addNotification("success", "A conflict has been resolved", data);
        });

        socket.on("task_deleted", (data) => {
            addNotification("warning", "Task has been deleted", data);
        });

        socket.on("task_completion_marked", (data) => {
            addNotification("info", "Task marked as complete by employee", data);
        });

        socket.on("conflict_review_needed", (data) => {
            addNotification("warning", "Admin needs your action on a conflict", data);
        });

        socket.on("admin_alert", (data) => {
            addNotification("alert", data.data.message || "Admin alert", data);
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [userRole, userId]);

    const addNotification = (type, message, data = {}) => {
        const id = Date.now();
        const notification = {
            id,
            type,
            message,
            data,
            timestamp: new Date()
        };
        
        setNotifications(prev => [notification, ...prev].slice(0, 50)); // Keep last 50
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const emitTaskEvent = (event, data) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit(event, data);
        } else {
            console.warn("Socket not connected, cannot emit event:", event);
        }
    };

    const joinTaskRoom = (taskId) => {
        if (socketRef.current) {
            socketRef.current.emit("join_task_room", taskId);
        }
    };

    const leaveTaskRoom = (taskId) => {
        if (socketRef.current) {
            socketRef.current.emit("leave_task_room", taskId);
        }
    };

    const setIsUploading = (isUploading) => {
        isUploadingRef.current = isUploading;
        sessionStorage.setItem("isUploading", isUploading ? "true" : "false");
    };

    return {
        socket: socketRef.current,
        connectionStatus,
        notifications,
        emitTaskEvent,
        joinTaskRoom,
        leaveTaskRoom,
        addNotification,
        setIsUploading,
        isOperationInProgress,
        pausePolling,
        resumePolling
    };
};
