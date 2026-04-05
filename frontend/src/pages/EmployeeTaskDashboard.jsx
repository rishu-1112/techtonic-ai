import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Trash2,
  Eye
} from "lucide-react";

export default function EmployeeTaskDashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");

  const token = localStorage.getItem("token");

  const api = axios.create({
    baseURL: "http://localhost:5000",
    headers: { Authorization: `Bearer ${token}` }
  });

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/tasks");
      setTasks(res.data);
    } catch (err) {
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
      setTasks(tasks.map(t => t._id === taskId ? res.data.task : t));
    } catch (err) {
      alert("Error updating task");
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
    } catch {
      alert("Delete failed");
    }
  };

  const getStatusColor = (status) => {
    if (status === "completed") return "bg-green-200 text-green-800";
    if (status === "in-progress") return "bg-blue-200 text-blue-800";
    if (status === "blocked") return "bg-red-200 text-red-800";
    return "bg-yellow-200 text-yellow-800";
  };

  const getPriorityColor = (priority) => {
    if (priority === "High") return "text-red-600";
    if (priority === "Medium") return "text-yellow-600";
    return "text-green-600";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl">
        🚀 Loading Tasks...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-8">
          🚀 My Tasks Dashboard
        </h1>

        {/* EMPTY STATE */}
        {tasks.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle size={60} className="mx-auto text-green-500 mb-4" />
            <p className="text-gray-600 text-lg animate-pulse">
              🎉 No active tasks
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {tasks.map(task => (
              <div
                key={task._id}
                className="backdrop-blur-lg bg-white/60 border border-white/30 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="p-6">

                  {/* HEADER */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {task.taskName}
                      </h3>

                      <span className={`px-3 py-1 mt-2 inline-block rounded-full text-sm font-semibold shadow ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>

                      {task.description && (
                        <p className="text-gray-600 mt-2">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <span className={`font-bold ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>

                  {/* INFO GRID */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-gray-500">Deadline</p>
                      <p className="font-semibold">
                        {new Date(task.deadline).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">Assigned By</p>
                      <p className="font-semibold">
                        {task.assignedBy?.name}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">Created</p>
                      <p className="font-semibold">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* WARNING */}
                  {task.inconsistencies?.length > 0 && (
                    <div className="p-3 bg-yellow-100 rounded-lg mb-4 flex items-center gap-2">
                      <AlertCircle size={18} />
                      {task.inconsistencies.length} conflicts detected
                    </div>
                  )}

                  {/* BUTTONS */}
                  <div className="flex gap-3 flex-wrap">

                    {task.status === "pending" && (
                      <button
                        onClick={() => updateTaskStatus(task._id, "in-progress")}
                        className="px-4 py-2 rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:scale-105 transition"
                      >
                        ⏳ Start
                      </button>
                    )}

                    {task.status === "in-progress" && (
                      <button
                        onClick={() => updateTaskStatus(task._id, "completed")}
                        className="px-4 py-2 rounded-xl text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:scale-105 transition"
                      >
                        ✅ Complete
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setExpandedTaskId(
                          expandedTaskId === task._id ? null : task._id
                        )
                      }
                      className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 transition"
                    >
                      👁 Details
                    </button>

                    <button
                      onClick={() => setShowDeleteModal(task._id)}
                      className="px-4 py-2 rounded-xl text-white bg-gradient-to-r from-red-500 to-pink-500 hover:scale-105 transition"
                    >
                      🗑 Delete
                    </button>
                  </div>

                  {/* DETAILS */}
                  {expandedTaskId === task._id && (
                    <div className="mt-4 p-4 bg-gray-100 rounded-lg text-sm">
                      <pre>
                        {JSON.stringify(task, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white/70 backdrop-blur-lg p-6 rounded-2xl shadow-2xl w-96">
              <h2 className="text-xl font-bold mb-4">
                Request Deletion
              </h2>

              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full border rounded p-2 mb-4"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="flex-1 bg-gray-300 py-2 rounded"
                >
                  Cancel
                </button>

                <button
                  onClick={() => requestTaskDeletion(showDeleteModal)}
                  className="flex-1 bg-red-500 text-white py-2 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}