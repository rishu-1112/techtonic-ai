import React, { useState, useEffect } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle, Clock, Trash2, Edit2, Eye } from "lucide-react";

export default function EmployeeTaskDashboard() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedTaskId, setExpandedTaskId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(null);
    const [deleteReason, setDeleteReason] = useState("");

    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;

    const api = axios.create({
        baseURL: "http://localhost:5000",
        headers: { Authorization: `Bearer ${token}` }
    });

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

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

    if (loading) return <div className="p-6 text-center">Loading tasks...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">My Tasks</h1>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

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
        </div>
    );
}
