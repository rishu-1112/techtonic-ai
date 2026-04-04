import React, { useState, useEffect } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle, Clock, Trash2, Eye, Bell, Mic, Square, Download, LogOut, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useTaskSocket } from "../hooks/useTaskSocket.js";
import NotificationCenter from "../components/NotificationCenter.jsx";
import { useNavigate } from "react-router-dom";

export default function EmployeeTaskDashboardWithSocket() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedTaskId, setExpandedTaskId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(null);
    const [deleteReason, setDeleteReason] = useState("");
    const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
    
    // Recording & Transcription states
    const [file, setFile] = useState(null);
    const [text, setText] = useState("");
    const [summary, setSummary] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;
    const navigate = useNavigate();

    const api = axios.create({
        baseURL: "http://localhost:5000",
        headers: { Authorization: `Bearer ${token}` }
    });

    // Set up Socket.io
    const {
        connectionStatus,
        notifications,
        emitTaskEvent,
        joinTaskRoom,
        leaveTaskRoom,
        setIsUploading,
        pausePolling,
        resumePolling
    } = useTaskSocket("employee", user?.id);

    // Recording timer
    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
        } else {
            setRecordingTime(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    useEffect(() => {
        fetchTasks();
        resumePolling(fetchTasks);

        return () => {
            pausePolling();
        };
    }, [resumePolling, pausePolling]);

    // Listen for real-time updates via Socket.io
    useEffect(() => {
        if (connectionStatus === "connected") {
            tasks.forEach(task => joinTaskRoom(task._id));
        }

        return () => {
            tasks.forEach(task => leaveTaskRoom(task._id));
        };
    }, [connectionStatus, tasks]);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const res = await api.get("/api/tasks?status=pending&status=in-progress");
            setTasks(res.data);
            setError(null);
        } catch (err) {
            setError("Failed to fetch tasks");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const updateTaskStatus = async (taskId, newStatus) => {
        try {
            const res = await api.patch(`/api/tasks/${taskId}/status`, {
                newStatus
            });

            // Update local state
            setTasks(tasks.map(t => t._id === taskId ? res.data.task : t));

            // Emit real-time update
            emitTaskEvent("update_task_status", {
                taskId,
                newStatus,
                updatedBy: user.name,
                timestamp: new Date()
            });

            alert(`Task marked as ${newStatus}`);
        } catch (err) {
            alert(err.response?.data?.error || "Failed to update task");
        }
    };

    const requestTaskDeletion = async (taskId) => {
        try {
            await api.delete(`/api/tasks/${taskId}`, {
                data: { reason: deleteReason }
            });

            setTasks(tasks.filter(t => t._id !== taskId));

            // Emit deletion request event
            emitTaskEvent("request_delete_task", {
                taskId,
                reason: deleteReason,
                requestedBy: user.name
            });

            setShowDeleteModal(null);
            setDeleteReason("");
            alert("Deletion request sent to admin");
        } catch (err) {
            alert(err.response?.data?.error || "Failed to request deletion");
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "completed":
                return "bg-green-100 text-green-800";
            case "in-progress":
                return "bg-blue-100 text-blue-800";
            case "blocked":
                return "bg-red-100 text-red-800";
            default:
                return "bg-yellow-100 text-yellow-800";
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case "High":
                return "text-red-600 font-bold";
            case "Medium":
                return "text-yellow-600 font-bold";
            default:
                return "text-green-600";
        }
    };

    const handleDismissNotification = (id) => {
        setDismissedNotifications(prev => new Set([...prev, id]));
    };

    // Recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "recording.webm", { type: 'audio/webm' });
                setFile(audioFile);
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            alert("Microphone access denied or error occurred: " + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder) {
            mediaRecorder.stop();
            setIsRecording(false);
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    };

    const handleUpload = async () => {
        if (!file) return alert("Select file first!");
        
        try {
            // ⏸️ PAUSE POLLING
            pausePolling();
            setIsUploading(true);
            
            const formData = new FormData();
            formData.append("audio", file);

            const res = await api.post("/upload", formData);
            setText(res.data.text);
            setSummary(res.data.summary || "");
            setFile(null);
            
            alert("✅ Upload successful! Transcription displayed above.");
            
            // Refresh after delay
            setTimeout(() => {
                fetchTasks();
            }, 2000);
        } catch (err) {
            alert("Error uploading file: " + (err.response?.data?.error || err.message));
        } finally {
            // ▶️ RESUME POLLING
            setIsUploading(false);
            resumePolling(fetchTasks);
        }
    };

    const isToday = (dateString) => {
        if (!dateString) return false;
        const today = new Date();
        const target = new Date(dateString);
        if (!isNaN(target.getTime())) {
            return (
                target.getDate() === today.getDate() &&
                target.getMonth() === today.getMonth() &&
                target.getFullYear() === today.getFullYear()
            );
        }
        return dateString.toLowerCase().includes("today");
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("My Tasks Summary", 14, 15);
        
        let yOffset = 25;
        
        if (summary) {
            doc.setFontSize(11);
            doc.text("Meeting Summary:", 14, yOffset);
            yOffset += 7;
            doc.setFontSize(10);
            const splitSummary = doc.splitTextToSize(summary, 180);
            doc.text(splitSummary, 14, yOffset);
            yOffset += (splitSummary.length * 5) + 5;
        }
        
        const tableColumn = ["Task", "Deadline", "Priority", "Status"];
        const tableRows = [];

        tasks.forEach(task => {
            const taskData = [
                task.taskName,
                new Date(task.deadline).toLocaleDateString() || "-",
                task.priority || "-",
                task.status
            ];
            tableRows.push(taskData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: yOffset,
            styles: { fontSize: 10, cellPadding: 3 },
            headStyles: { fillColor: [59, 130, 246], textColor: 255 },
            alternateRowStyles: { fillColor: [243, 244, 246] }
        });

        doc.save("my_tasks_summary.pdf");
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const visibleNotifications = notifications.filter(
        n => !dismissedNotifications.has(n.id)
    );

    if (loading) return <div className="p-6 text-center text-gray-900">Loading tasks...</div>;

    // Calculate summary stats
    const completedTasks = tasks.filter(t => t.status === "completed").length;
    const inProgressTasks = tasks.filter(t => t.status === "in-progress").length;
    const highPriorityTasks = tasks.filter(t => t.priority === "High").length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* NAVBAR */}
                <nav className="flex justify-between items-center mb-8 bg-white rounded-lg shadow-lg px-6 py-4">
                    <h1 className="text-2xl font-extrabold text-gray-900">My Tasks Dashboard</h1>
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
                            connectionStatus === "connected"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                        }`}>
                            <div className={`w-2 h-2 rounded-full ${
                                connectionStatus === "connected" ? "bg-green-600" : "bg-red-600"
                            }`} />
                            {connectionStatus === "connected" ? "Live" : "Offline"}
                        </div>
                        <span className="text-sm text-gray-600">Welcome, <span className="font-semibold">{user?.name}</span></span>
                        <button onClick={handleLogout} className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors">
                            <LogOut size={18} /> Logout
                        </button>
                    </div>
                </nav>

                {/* SUMMARY STATS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                        <p className="text-gray-500 text-sm">Active Tasks</p>
                        <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                        <p className="text-gray-500 text-sm">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                        <p className="text-gray-500 text-sm">In Progress</p>
                        <p className="text-2xl font-bold text-yellow-600">{inProgressTasks}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
                        <p className="text-gray-500 text-sm">High Priority</p>
                        <p className="text-2xl font-bold text-red-600">{highPriorityTasks}</p>
                    </div>
                </div>

                {/* RECORDING & TRANSCRIPTION SECTION */}
                <div className="grid lg:grid-cols-3 gap-6 mb-8">
                    {/* Upload & Recording */}
                    <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-blue-500">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900">Upload or Record Audio</h2>
                        <div className="flex flex-col gap-3 mb-4">
                            <input
                                type="file"
                                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-600 hover:file:bg-blue-500/30 cursor-pointer"
                                onChange={(e) => setFile(e.target.files[0])}
                            />
                            {!isRecording ? (
                                <button onClick={startRecording} className="w-full bg-red-500/20 text-red-600 font-semibold px-4 py-2 rounded-lg hover:bg-red-500/30 transition-all flex justify-center items-center gap-2 border border-red-500/30">
                                    <Mic size={18} /> Start Recording
                                </button>
                            ) : (
                                <button onClick={stopRecording} className="w-full bg-red-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-all shadow-lg flex justify-center items-center gap-2 animate-pulse">
                                    <Square size={18} /> Stop Recording ({recordingTime}s)
                                </button>
                            )}
                        </div>
                        {file && <p className="text-sm text-green-600 mb-3 truncate text-center bg-green-500/10 py-1.5 rounded border border-green-500/20">Selected: {file.name}</p>}
                        <button
                            onClick={handleUpload}
                            className="w-full bg-blue-600 font-semibold text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-lg"
                        >
                            Upload & Generate
                        </button>
                    </div>

                    {/* Transcription */}
                    {text && (
                        <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-green-500">
                            <h2 className="text-lg font-semibold mb-3 text-gray-900">Transcription</h2>
                            <div className="max-h-52 overflow-y-auto pr-2">
                                <p className="text-gray-700 text-sm leading-relaxed">{text}</p>
                            </div>
                        </div>
                    )}

                    {/* Meeting Summary & Export */}
                    <div className="bg-white shadow-lg rounded-lg p-6 border-l-4 border-purple-500">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">Meeting Summary</h2>
                            <button 
                                onClick={exportToPDF}
                                className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded text-white font-semibold hover:bg-blue-700 transition text-xs"
                            >
                                <Download size={14} /> Export
                            </button>
                        </div>
                        {summary ? (
                            <p className="text-gray-700 text-sm leading-relaxed">{summary}</p>
                        ) : (
                            <p className="text-gray-500 text-sm italic">Upload audio to generate summary</p>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

                {/* MY TASKS SECTION */}
                <h2 className="text-2xl font-bold text-gray-900 mb-6">My Active Tasks</h2>

                {tasks.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                        <p className="text-gray-500 text-lg">No active tasks</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tasks.map(task => (
                            <div
                                key={task._id}
                                className="bg-white rounded-lg shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow"
                            >
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {task.taskName}
                                                </h3>
                                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(task.status)}`}>
                                                    {task.status}
                                                </span>
                                            </div>
                                            {task.description && (
                                                <p className="text-gray-600 text-sm mb-2">{task.description}</p>
                                            )}
                                        </div>
                                        <span className={`text-sm font-bold ${getPriorityColor(task.priority)}`}>
                                            {task.priority} Priority
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                        <div>
                                            <p className="text-gray-500">Deadline</p>
                                            <p className="font-semibold text-gray-900">
                                                {new Date(task.deadline).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Employee ID</p>
                                            <p className="font-semibold text-gray-900">{task.empId}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Assigned By</p>
                                            <p className="font-semibold text-gray-900">{task.assignedBy?.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Created</p>
                                            <p className="font-semibold text-gray-900">
                                                {new Date(task.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Conflicts Badge */}
                                    {task.inconsistencies.length > 0 && (
                                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                            <div className="flex items-center gap-2 text-yellow-800">
                                                <AlertCircle size={18} />
                                                <span className="text-sm font-semibold">
                                                    {task.inconsistencies.length} conflict(s) need resolution
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 flex-wrap">
                                        {task.status !== "completed" && (
                                            <>
                                                {task.status === "pending" && (
                                                    <button
                                                        onClick={() => updateTaskStatus(task._id, "in-progress")}
                                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                                                    >
                                                        <Clock size={16} /> Start Work
                                                    </button>
                                                )}
                                                {task.status === "in-progress" && (
                                                    <button
                                                        onClick={() => updateTaskStatus(task._id, "completed")}
                                                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                                                    >
                                                        <CheckCircle size={16} /> Mark Complete
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        <button
                                            onClick={() => setExpandedTaskId(expandedTaskId === task._id ? null : task._id)}
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition"
                                        >
                                            <Eye size={16} /> Details
                                        </button>
                                    </div>

                                    {/* Expanded Details */}
                                    {expandedTaskId === task._id && (
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <h4 className="font-semibold mb-2 text-gray-900">Task Details:</h4>
                                            <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-64 text-gray-800">
                                                {JSON.stringify(
                                                    {
                                                        taskId: task._id,
                                                        status: task.status,
                                                        isFinalized: task.isFinalized,
                                                        canDelete: task.canDelete,
                                                        inconsistencies: task.inconsistencies
                                                    },
                                                    null,
                                                    2
                                                )}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h2 className="text-xl font-bold mb-4 text-gray-900">Request Task Deletion</h2>
                            <p className="text-gray-600 mb-4">
                                Are you sure you want to request deletion? Admin approval is required.
                            </p>
                            <textarea
                                value={deleteReason}
                                onChange={(e) => setDeleteReason(e.target.value)}
                                placeholder="Enter reason for deletion (optional)"
                                className="w-full border border-gray-300 rounded px-3 py-2 mb-4 text-gray-900"
                                rows="3"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(null)}
                                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => requestTaskDeletion(showDeleteModal)}
                                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
                                >
                                    Request Deletion
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Notification Center */}
            <NotificationCenter
                notifications={visibleNotifications}
                onDismiss={handleDismissNotification}
            />
        </div>
    );
}
