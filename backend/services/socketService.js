/**
 * Socket.IO Real-Time Service
 * Manages real-time task updates, notifications, and admin alerts
 */

export const initializeSocketHandlers = (io) => {
    const adminNamespace = io.of("/admin-tasks");
    const employeeNamespace = io.of("/employee-tasks");
    
    // Store connected users
    const connectedUsers = new Map();
    const adminConnections = new Set();
    
    // Admin namespace
    adminNamespace.on("connection", (socket) => {
        console.log(`[Admin] Connected: ${socket.id}`);
        
        // Store admin connection
        adminConnections.add(socket.id);
        connectedUsers.set(socket.id, {
            type: "admin",
            userId: socket.userData?.userId
        });
        
        // Subscribe to task room
        socket.on("join_task_room", (taskId) => {
            socket.join(`task_${taskId}`);
            console.log(`[Admin] Joined task room: task_${taskId}`);
        });
        
        // Leave task room
        socket.on("leave_task_room", (taskId) => {
            socket.leave(`task_${taskId}`);
        });
        
        // Subscribe to conflicts feed
        socket.on("subscribe_conflicts", () => {
            socket.join("admin_conflicts");
            socket.emit("subscription_confirmed", {
                room: "admin_conflicts",
                message: "Subscribed to conflict updates"
            });
        });
        
        // Listen for task status updates
        socket.on("task_status_update", (data) => {
            const { taskId, newStatus, updatedBy, timestamp } = data;
            
            // Broadcast to all admins in the task room
            adminNamespace.to(`task_${taskId}`).emit("task_status_changed", {
                taskId,
                newStatus,
                updatedBy,
                timestamp,
                message: `Task status changed to ${newStatus}`
            });
            
            // Broadcast to employee
            employeeNamespace.to(`task_${taskId}`).emit("task_status_changed", {
                taskId,
                newStatus,
                timestamp
            });
        });
        
        // Listen for conflict flagged events
        socket.on("conflict_flagged", (data) => {
            const { taskId, inconsistency, flaggedBy } = data;
            
            // Alert all admins
            adminNamespace.to("admin_conflicts").emit("new_conflict", {
                taskId,
                inconsistency,
                flaggedBy,
                severity: inconsistency.severity,
                timestamp: new Date(),
                requiresAction: true
            });
        });
        
        // Listen for conflict resolution
        socket.on("resolve_conflict", (data) => {
            const { taskId, resolutionNotes, resolvedBy } = data;
            
            // Broadcast resolution to all connected clients
            io.to(`task_${taskId}`).emit("conflict_resolved", {
                taskId,
                resolutionNotes,
                resolvedBy,
                timestamp: new Date(),
                message: "Conflict has been resolved"
            });
            
            // Remove from conflicts feed
            adminNamespace.to("admin_conflicts").emit("conflict_resolved", {
                taskId,
                resolvedBy
            });
        });
        
        // Listen for task assignment
        socket.on("task_assigned", (data) => {
            const { taskId, assignedTo, assignedBy, taskDetails } = data;
            
            // Notify the assigned employee
            employeeNamespace.to(`user_${assignedTo}`).emit("new_task_assigned", {
                taskId,
                taskDetails,
                assignedBy,
                timestamp: new Date(),
                message: "New task assigned to you"
            });
            
            // Notify all admins
            adminNamespace.emit("task_assigned_event", {
                taskId,
                assignedTo,
                assignedBy,
                timestamp: new Date()
            });
        });
        
        // Listen for task deletion request from admin
        socket.on("delete_task", (data) => {
            const { taskId, reason, deletedBy } = data;
            
            // Notify employee
            employeeNamespace.to(`task_${taskId}`).emit("task_deleted", {
                taskId,
                reason,
                deletedBy,
                timestamp: new Date()
            });
            
            // Broadcast to all admins
            adminNamespace.emit("task_deleted_event", {
                taskId,
                reason,
                deletedBy,
                timestamp: new Date()
            });
        });
        
        // Disconnect
        socket.on("disconnect", () => {
            console.log(`[Admin] Disconnected: ${socket.id}`);
            adminConnections.delete(socket.id);
            connectedUsers.delete(socket.id);
        });
    });
    
    // Employee namespace
    employeeNamespace.on("connection", (socket) => {
        console.log(`[Employee] Connected: ${socket.id}`);
        
        connectedUsers.set(socket.id, {
            type: "employee",
            userId: socket.userData?.userId,
            empId: socket.userData?.empId
        });
        
        // Subscribe to user's tasks
        socket.on("join_user_tasks", (userId) => {
            socket.join(`user_${userId}`);
            socket.join(`employee_notify_${userId}`);
            console.log(`[Employee] Joined personal task room: user_${userId}`);
        });
        
        // Subscribe to specific task
        socket.on("join_task", (taskId) => {
            socket.join(`task_${taskId}`);
            console.log(`[Employee] Joined task room: task_${taskId}`);
        });
        
        // Listen for employee marking task complete
        socket.on("mark_task_complete", (data) => {
            const { taskId, markedBy, timestamp } = data;
            
            // Notify admins in task room
            adminNamespace.to(`task_${taskId}`).emit("employee_marked_complete", {
                taskId,
                markedBy,
                timestamp,
                message: "Employee marked this task as complete"
            });
            
            // Alert admins for review
            adminNamespace.to("admin_conflicts").emit("task_completion_marked", {
                taskId,
                markedBy,
                timestamp
            });
        });
        
        // Listen for employee requesting task deletion
        socket.on("request_delete_task", (data) => {
            const { taskId, reason, requestedBy } = data;
            
            // Send deletion request to admins
            adminNamespace.to("admin_conflicts").emit("task_deletion_requested", {
                taskId,
                reason,
                requestedBy,
                timestamp: new Date(),
                requiresApproval: true
            });
        });
        
        // Listen for task status update from employee (if allowed)
        socket.on("update_task_status", (data) => {
            const { taskId, newStatus, updatedBy } = data;
            
            // Only allow if permitted
            adminNamespace.to(`task_${taskId}`).emit("employee_status_update_request", {
                taskId,
                newStatus,
                updatedBy,
                timestamp: new Date(),
                requiresApproval: true
            });
        });
        
        // Disconnect
        socket.on("disconnect", () => {
            console.log(`[Employee] Disconnected: ${socket.id}`);
            connectedUsers.delete(socket.id);
        });
    });
    
    return {
        adminNamespace,
        employeeNamespace,
        broadcastToAdmins: (event, data) => {
            adminNamespace.emit(event, data);
        },
        broadcastToEmployee: (userId, event, data) => {
            employeeNamespace.to(`user_${userId}`).emit(event, data);
        },
        broadcastToTask: (taskId, event, data, role = "everyone") => {
            if (role === "admin" || role === "everyone") {
                adminNamespace.to(`task_${taskId}`).emit(event, data);
            }
            if (role === "employee" || role === "everyone") {
                employeeNamespace.to(`task_${taskId}`).emit(event, data);
            }
        },
        getConnectedAdmins: () => adminConnections.size,
        getConnectedUsers: () => connectedUsers.size
    };
};

/**
 * Helper function to emit real-time task update
 */
export const emitTaskUpdate = (io, taskId, event, data, targetRole = "everyone") => {
    const admin = io.of("/admin-tasks");
    const employee = io.of("/employee-tasks");
    
    if (targetRole === "admin" || targetRole === "everyone") {
        admin.to(`task_${taskId}`).emit(event, data);
    }
    if (targetRole === "employee" || targetRole === "everyone") {
        employee.to(`task_${taskId}`).emit(event, data);
    }
};

/**
 * Helper to send admin alert
 */
export const sendAdminAlert = (io, alertType, data) => {
    const admin = io.of("/admin-tasks");
    admin.to("admin_conflicts").emit("admin_alert", {
        type: alertType,
        data,
        timestamp: new Date(),
        severity: data.severity || "info"
    });
};
