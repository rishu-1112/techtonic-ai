import React, { useState, useEffect } from "react";
import axios from "axios";
import {
    AlertTriangle,
    CheckCircle,
    Trash2,
    Eye,
    Filter,
    RefreshCw,
    BarChart3,
    Bell,
    Mic,
    Square,
    Download,
    LogOut,
    Clock,
    AlertCircle,
    FileText,
    Plus
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useTaskSocket } from "../hooks/useTaskSocket.js";
import NotificationCenter from "../components/NotificationCenter.jsx";
import ManualTaskAssignmentModal from "../components/ManualTaskAssignmentModal.jsx";
import { useNavigate } from "react-router-dom";

export default function AdminTaskDashboardWithSocket() {
    const [stats, setStats] = useState(null);
    const [conflicts, setConflicts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterMode, setFilterMode] = useState("all"); // all, conflicts, critical
    const [selectedTask, setSelectedTask] = useState(null);
    const [resolutionNotes, setResolutionNotes] = useState("");
    const [resolveAction, setResolveAction] = useState("resolve_only");
    const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [editTaskData, setEditTaskData] = useState({
        taskName: "",
        assignedTo: "",
        deadline: ""
    });
    
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
    } = useTaskSocket("admin", user?.id);

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

    // Setup polling with pause/resume capability
    useEffect(() => {
        fetchDashboardData();
        fetchEmployees();
        if (!showAssignmentModal) {
            resumePolling(fetchDashboardData);
        }
        
        return () => {
            pausePolling();
        };
    }, [resumePolling, pausePolling, showAssignmentModal]);

    useEffect(() => {
        if (selectedTask) {
            setEditTaskData({
                taskName: selectedTask.taskName || selectedTask.task || "",
                assignedTo: selectedTask.assignedTo?._id || "",
                deadline: selectedTask.deadline || ""
            });
        }
    }, [selectedTask]);

    const fetchEmployees = async () => {
        try {
            const res = await api.get("/api/admin/employees");
            setEmployees(res.data || []);
        } catch (err) {
            console.error("Error fetching employees:", err);
        }
    };

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [statsRes, tasksRes, conflictsRes] = await Promise.all([
                api.get("/api/admin/dashboard/overview"),
                api.get("/api/tasks"),
                api.get("/api/admin/conflicts")
            ]);

            setStats(statsRes.data);
            setTasks(tasksRes.data);
            setConflicts(conflictsRes.data.conflicts);
        } catch (err) {
            console.error("Error fetching dashboard:", err);
        } finally {
            setLoading(false);
        }
    };

    const approveConflict = async (taskId) => {
        try {
            // Update the underlying task dynamically if modified
            if (editTaskData.taskName || editTaskData.assignedTo || editTaskData.deadline) {
                await api.patch(`/api/tasks/${taskId}`, {
                    taskName: editTaskData.taskName,
                    assignedTo: editTaskData.assignedTo || undefined,
                    deadline: editTaskData.deadline,
                    empId: employees.find(e => e._id === editTaskData.assignedTo)?.empId
                });
            }

            await api.patch(`/api/admin/conflicts/${taskId}/approve`, {
                resolutionNotes,
                action: resolveAction
            });

            // Emit resolution event
            emitTaskEvent("resolve_conflict", {
                taskId,
                resolutionNotes,
                resolvedBy: user.name
            });

            alert("Conflict resolved!");
            setSelectedTask(null);
            setResolutionNotes("");
            fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.error || "Error resolving conflict");
        }
    };

    const deleteTask = async (taskId) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await api.delete(`/api/tasks/${taskId}`, {
                data: { reason: "Admin deletion" }
            });

            // Emit deletion event
            emitTaskEvent("delete_task", {
                taskId,
                reason: "Admin deletion",
                deletedBy: user.name
            });

            alert("Task deleted!");
            fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.error || "Error deleting task");
        }
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
            // ⏸️ PAUSE POLLING - Critical to prevent refresh interruptions
            pausePolling();
            setIsUploading(true);
            
            const formData = new FormData();
            formData.append("audio", file);

            // Call backend which calls AI service
            const res = await api.post("/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            // Display transcription from response (don't call fetchDashboardData)
            if (res.data.text) {
                setText(res.data.text);
                setSummary(res.data.summary || "");
                setFile(null); // Clear file input
                
                alert("✅ Upload successful! Transcription displayed above.");
                
                // Refresh dashboard after a delay to fetch new tasks
                setTimeout(() => {
                    fetchDashboardData();
                }, 2000);
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Error uploading file: " + (err.response?.data?.error || err.message));
        } finally {
            // ▶️ RESUME POLLING
            setIsUploading(false);
            resumePolling(fetchDashboardData);
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
        doc.text("Meeting Tasks Summary", 14, 15);
        
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
        
        const tableColumn = ["Task", "Assigned To", "Deadline", "Priority", "Status"];
        const tableRows = [];

        tasks.forEach(task => {
            const taskData = [
                task.taskName,
                task.assignedTo?.name || "Unassigned",
                !isNaN(new Date(task.deadline).getTime()) ? new Date(task.deadline).toLocaleDateString() : task.deadline || "-",
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

        doc.save("admin_tasks_summary.pdf");
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const getFilteredData = () => {
        if (filterMode === "conflicts") return conflicts;
        if (filterMode === "critical") {
            return conflicts.filter(t =>
                t.inconsistencies.some(i => i.severity === "critical")
            );
        }
        return tasks;
    };

    const handleDismissNotification = (id) => {
        setDismissedNotifications(prev => new Set([...prev, id]));
    };

    const filteredData = getFilteredData();
    const visibleNotifications = notifications.filter(
        n => !dismissedNotifications.has(n.id)
    );

    if (loading) return <div className="p-6 text-center text-gray-900">Loading dashboard...</div>;

    // Calculate summary stats
    const pendingTasks = tasks.filter(t => t.status === "pending").length;
    const completedTasks = tasks.filter(t => t.status === "completed").length;
    const highPriorityTasks = tasks.filter(t => t.priority === "High").length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* NAVBAR */}
                <nav className="max-w-7xl mx-auto flex justify-between items-center mb-8 bg-white rounded-lg shadow-lg px-6 py-4">
                    <h1 className="text-2xl font-extrabold text-gray-900">Admin Dashboard</h1>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                        <p className="text-gray-500 text-sm">Total Tasks</p>
                        <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                        <p className="text-gray-500 text-sm">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                        <p className="text-gray-500 text-sm">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600">{pendingTasks}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
                        <p className="text-gray-500 text-sm">High Priority</p>
                        <p className="text-2xl font-bold text-red-600">{highPriorityTasks}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
                        <p className="text-gray-500 text-sm">With Conflicts</p>
                        <p className="text-2xl font-bold text-purple-600">{conflicts.length}</p>
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

                {/* TASK MANAGEMENT SECTION */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Task Management</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowAssignmentModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                                <Plus size={18} /> Assign Task
                            </button>
                            <button
                                onClick={fetchDashboardData}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <RefreshCw size={18} /> Refresh
                            </button>
                        </div>
                    </div>

                {/* Filter Tabs */}
                <div className="mb-6 flex gap-2 bg-white rounded-lg p-2 shadow">
                    <button
                        onClick={() => setFilterMode("all")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "all"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                        }`}
                    >
                        All Tasks ({tasks.length})
                    </button>
                    <button
                        onClick={() => setFilterMode("conflicts")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "conflicts"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                        }`}
                    >
                        With Conflicts ({conflicts.length})
                    </button>
                    <button
                        onClick={() => setFilterMode("critical")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "critical"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                        }`}
                    >
                        Critical Only
                    </button>
                </div>

                {/* Task List */}
                <div className="space-y-4">
                    {filteredData.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg">
                            <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                            <p className="text-gray-500">No tasks to display</p>
                        </div>
                    ) : (
                        filteredData.map(task => (
                            <div
                                key={task._id}
                                className="bg-white rounded-lg shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow"
                            >
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {task.taskName || task.task}
                                                </h3>
                                                <span className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800 font-semibold">
                                                    {task.status}
                                                </span>
                                                {task?.inconsistencies?.length > 0 && (
                                                    <span className="px-3 py-1 rounded-full text-xs bg-red-100 text-red-800 font-semibold">
                                                        {task.inconsistencies.length} conflicts
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-600">
                                            {task.priority} Priority
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-4 text-sm">
                                        <div>
                                            <p className="text-gray-500">EmpID</p>
                                            <p className="font-semibold text-gray-900">{task.empId}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Assigned To</p>
                                            <p className="font-semibold text-gray-900">
                                                {task.assignedTo?.name || task.assignedToName || "Unassigned"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Assigned By</p>
                                            <p className="font-semibold text-gray-900">
                                                {task.assignedBy?.name || "Unknown"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Deadline</p>
                                            <p className="font-semibold text-gray-900">
                                                {!isNaN(new Date(task.deadline).getTime()) 
                                                    ? new Date(task.deadline).toLocaleDateString() 
                                                    : task.deadline || "-"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Finalized</p>
                                            <p className={`font-semibold ${
                                                task.isFinalized ? "text-green-600" : "text-yellow-600"
                                            }`}>
                                                {task.isFinalized ? "Yes" : "No"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Can Delete</p>
                                            <p className="font-semibold text-gray-900">
                                                {task.canDelete ? "Yes" : "No"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Conflicts Display */}
                                    {task.inconsistencies && task.inconsistencies.length > 0 && (
                                        <div className="mb-4 space-y-2">
                                            {task.inconsistencies.map((inc, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`p-3 rounded border-l-4 ${
                                                        inc.severity === "critical"
                                                            ? "bg-red-50 border-red-500 text-red-800"
                                                            : "bg-yellow-50 border-yellow-500 text-yellow-800"
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="font-semibold capitalize">
                                                                {inc.type.replace(/_/g, " ")}
                                                            </p>
                                                            <p className="text-sm">{inc.description}</p>
                                                            <p className="text-xs mt-1 opacity-75">
                                                                Flagged: {new Date(inc.flaggedAt).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 flex-wrap">
                                        {task.inconsistencies && task.inconsistencies.length > 0 && (
                                            <button
                                                onClick={() => setSelectedTask(task)}
                                                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                                            >
                                                <CheckCircle size={16} /> Resolve & Approve
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteTask(task._id)}
                                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                        <button
                                            onClick={() =>
                                                setSelectedTask(
                                                    selectedTask?._id === task._id ? null : task
                                                )
                                            }
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition"
                                        >
                                            <Eye size={16} /> Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                </div>
            </div>

            {/* Conflict Resolution Modal */}
            {selectedTask && selectedTask.inconsistencies?.length > 0 && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
                        <div className="sticky top-0 bg-gray-50 border-b p-6">
                            <h2 className="text-2xl font-bold text-gray-900">Resolve Conflicts</h2>
                            <p className="text-gray-600 text-sm mt-1">{selectedTask.taskName || selectedTask.task}</p>
                        </div>

                        <div className="p-6 space-y-4">
                            {selectedTask.inconsistencies.map((inc, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded border-l-4 ${
                                        inc.severity === "critical"
                                            ? "bg-red-50 border-red-500"
                                            : "bg-yellow-50 border-yellow-500"
                                    }`}
                                >
                                    <p className="font-semibold capitalize text-gray-900">
                                        {inc.type.replace(/_/g, " ")}
                                    </p>
                                    <p className="text-sm text-gray-700 mt-1">{inc.description}</p>
                                </div>
                            ))}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1">
                                        Corrected Task Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editTaskData.taskName}
                                        onChange={(e) => setEditTaskData({...editTaskData, taskName: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1">
                                        Corrected Deadline
                                    </label>
                                    <input
                                        type="text"
                                        value={editTaskData.deadline}
                                        onChange={(e) => setEditTaskData({...editTaskData, deadline: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                        placeholder="e.g. tomorrow, YYYY-MM-DD"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1">
                                    Map to Employee
                                </label>
                                <select
                                    value={editTaskData.assignedTo}
                                    onChange={(e) => setEditTaskData({...editTaskData, assignedTo: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                >
                                    <option value="">-- Leave Unassigned --</option>
                                    {employees.map(emp => (
                                        <option key={emp._id} value={emp._id}>
                                            {emp.name} ({emp.empId}) - {emp.email}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Resolution Notes
                                </label>
                                <textarea
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                    placeholder="Explain how this conflict was resolved..."
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                    rows="4"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Action
                                </label>
                                <select
                                    value={resolveAction}
                                    onChange={(e) => setResolveAction(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                >
                                    <option value="resolve_only">Resolve only (don't finalize)</option>
                                    <option value="resolve_and_finalize">Resolve and Finalize</option>
                                </select>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex gap-3">
                            <button
                                onClick={() => setSelectedTask(null)}
                                className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => approveConflict(selectedTask._id)}
                                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
                            >
                                Resolve & Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Center */}
            <NotificationCenter
                notifications={visibleNotifications}
                onDismiss={handleDismissNotification}
            />

            {/* Manual Task Assignment Modal */}
            <ManualTaskAssignmentModal
                isOpen={showAssignmentModal}
                onClose={() => setShowAssignmentModal(false)}
                onTaskCreated={(newTask) => {
                    setTasks(prev => [newTask, ...prev]);
                    fetchDashboardData();
                }}
                token={token}
            />
        </div>
    );
}
