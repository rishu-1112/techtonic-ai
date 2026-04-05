import React, { useState, useEffect } from "react";
import axios from "axios";
import {
    AlertTriangle,
    CheckCircle,
    Trash2,
    Eye,
    Filter,
    RefreshCw,
    BarChart3
} from "lucide-react";

export default function AdminTaskDashboard() {
    const [stats, setStats] = useState(null);
    const [conflicts, setConflicts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterMode, setFilterMode] = useState("all"); // all, conflicts, critical
    const [selectedTask, setSelectedTask] = useState(null);
    const [resolutionNotes, setResolutionNotes] = useState("");
    const [resolveAction, setResolveAction] = useState("resolve_only");
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTask, setEditTask] = useState(null);
    const [editForm, setEditForm] = useState({
        taskName: "",
        empId: "",
        assignedTo: "",
        deadline: "",
        priority: "Low",
        description: ""
    });

    const token = localStorage.getItem("token");
    const api = axios.create({
        baseURL: "http://localhost:5000",
        headers: { Authorization: `Bearer ${token}` }
    });

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000);
        return () => clearInterval(interval);
    }, []);

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
            await api.patch(`/api/admin/conflicts/${taskId}/approve`, {
                resolutionNotes,
                action: resolveAction
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
            alert("Task deleted!");
            fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.error || "Error deleting task");
        }
    };

    const openEditModal = (task) => {
        setEditTask(task);
        setEditForm({
            taskName: task.taskName || "",
            empId: task.empId || "",
            assignedTo: task.assignedTo?._id || "",
            deadline: task.deadline || "",
            priority: task.priority || "Low",
            description: task.description || ""
        });
        setShowEditModal(true);
    };

    const updateTask = async () => {
        try {
            const res = await api.patch(`/api/tasks/${editTask._id}`, editForm);
            alert("Task updated!");
            setShowEditModal(false);
            setEditTask(null);
            fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.error || "Error updating task");
        }
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

    const filteredData = getFilteredData();

    if (loading) return <div className="p-6 text-center text-gray-900">Loading dashboard...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                    <button
                        onClick={fetchDashboardData}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        <RefreshCw size={18} /> Refresh
                    </button>
                </div>

                {/* Statistics Cards */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                            <p className="text-gray-500 text-sm">Total Tasks</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.stats.totalTasks}</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                            <p className="text-gray-500 text-sm">With Conflicts</p>
                            <p className="text-2xl font-bold text-yellow-600">{stats.stats.tasksWithConflicts}</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
                            <p className="text-gray-500 text-sm">Critical Issues</p>
                            <p className="text-2xl font-bold text-red-600">{stats.stats.criticalConflicts}</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                            <p className="text-gray-500 text-sm">Completed</p>
                            <p className="text-2xl font-bold text-green-600">{stats.stats.completedTasks}</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
                            <p className="text-gray-500 text-sm">Pending Finalization</p>
                            <p className="text-2xl font-bold text-purple-600">{stats.stats.pendingFinalization}</p>
                        </div>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="mb-6 flex gap-2 bg-white rounded-lg p-2 shadow">
                    <button
                        onClick={() => setFilterMode("all")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "all"
                                ? "bg-blue-500 text-white"
                                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                        }`}
                    >
                        All Tasks ({tasks.length})
                    </button>
                    <button
                        onClick={() => setFilterMode("conflicts")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "conflicts"
                                ? "bg-blue-500 text-white"
                                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                        }`}
                    >
                        With Conflicts ({conflicts.length})
                    </button>
                    <button
                        onClick={() => setFilterMode("critical")}
                        className={`px-4 py-2 rounded ${
                            filterMode === "critical"
                                ? "bg-blue-500 text-white"
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
                                                    {task.taskName}
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

                                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-4 text-sm">
                                        <div>
                                            <p className="text-gray-500">EmpID</p>
                                            <p className="font-semibold text-gray-900">{task.empId}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Assigned To</p>
                                            <p className="font-semibold text-gray-900">{task.assignedTo?.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Deadline</p>
                                            <p className="font-semibold text-gray-900">
                                                {new Date(task.deadline).toLocaleDateString()}
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
                                        <button
                                            onClick={() => openEditModal(task)}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                                        >
                                            <Edit2 size={16} /> Edit
                                        </button>
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

            {/* Edit Task Modal */}
            {showEditModal && editTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
                        <div className="sticky top-0 bg-gray-50 border-b p-6">
                            <h2 className="text-2xl font-bold text-gray-900">Edit Task</h2>
                            <p className="text-gray-600 text-sm mt-1">{editTask.taskName}</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Task Name
                                </label>
                                <input
                                    type="text"
                                    value={editForm.taskName}
                                    onChange={(e) => setEditForm({...editForm, taskName: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Employee ID
                                </label>
                                <input
                                    type="text"
                                    value={editForm.empId}
                                    onChange={(e) => setEditForm({...editForm, empId: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Assigned To (User ID)
                                </label>
                                <input
                                    type="text"
                                    value={editForm.assignedTo}
                                    onChange={(e) => setEditForm({...editForm, assignedTo: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Deadline
                                </label>
                                <input
                                    type="datetime-local"
                                    value={editForm.deadline}
                                    onChange={(e) => setEditForm({...editForm, deadline: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Priority
                                </label>
                                <select
                                    value={editForm.priority}
                                    onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={editForm.description}
                                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                                    rows="3"
                                />
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex gap-3">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={updateTask}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                            >
                                Update Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Resolution Modal */}
            {selectedTask && selectedTask.inconsistencies?.length > 0 && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
                        <div className="sticky top-0 bg-gray-50 border-b p-6">
                            <h2 className="text-2xl font-bold text-gray-900">Resolve Conflicts</h2>
                            <p className="text-gray-600 text-sm mt-1">{selectedTask.taskName}</p>
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
        </div>
    );
}
