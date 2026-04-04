import React, { useState, useEffect } from "react";
import axios from "axios";
import { X, Send, Loader } from "lucide-react";

export default function ManualTaskAssignmentModal({ isOpen, onClose, onTaskCreated, token }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [formData, setFormData] = useState({
        taskName: "",
        empId: "",
        assignedTo: "",
        deadline: "",
        priority: "Medium",
        description: ""
    });

    const api = axios.create({
        baseURL: "http://localhost:5000",
        headers: { Authorization: `Bearer ${token}` }
    });

    // Fetch employees on mount
    useEffect(() => {
        if (isOpen) {
            fetchEmployees();
        }
    }, [isOpen]);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            const res = await api.get("/api/auth/employees");
            setEmployees(res.data || []);
            setError(null);
        } catch (err) {
            console.error("Error fetching employees:", err);
            setError("Failed to load employees");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleEmployeeSelect = (e) => {
        const selectedId = e.target.value;
        const selected = employees.find(emp => emp._id === selectedId);
        setFormData(prev => ({
            ...prev,
            assignedTo: selectedId,
            empId: selected?.employeeId || ""
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.taskName.trim()) {
            setError("Task name is required");
            return;
        }
        if (!formData.assignedTo) {
            setError("Please select an employee");
            return;
        }
        if (!formData.deadline) {
            setError("Deadline is required");
            return;
        }

        try {
            setSubmitting(true);
            setError(null);
            
            const taskPayload = {
                taskName: formData.taskName.trim(),
                empId: formData.empId,
                assignedTo: formData.assignedTo,
                deadline: formData.deadline,
                priority: formData.priority,
                description: formData.description.trim()
            };

            const res = await api.post("/api/tasks/create", taskPayload);
            
            setSuccess("Task assigned successfully! ✅");
            
            // Clear form
            setFormData({
                taskName: "",
                empId: "",
                assignedTo: "",
                deadline: "",
                priority: "Medium",
                description: ""
            });

            // Notify parent
            if (onTaskCreated) {
                onTaskCreated(res.data.task);
            }

            // Close after 2 seconds
            setTimeout(() => {
                onClose();
                setSuccess(null);
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to create task");
            console.error("Error creating task:", err);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Assign Task to Employee</h2>
                    <button
                        onClick={onClose}
                        className="hover:bg-blue-800 p-1 rounded transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">
                            {success}
                        </div>
                    )}

                    {/* Task Name */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                            Task Name *
                        </label>
                        <input
                            type="text"
                            name="taskName"
                            value={formData.taskName}
                            onChange={handleInputChange}
                            placeholder="e.g., Complete project documentation"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={submitting}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            placeholder="Task details and requirements..."
                            rows="2"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={submitting}
                        />
                    </div>

                    {/* Employee Select */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                            Assign to Employee *
                        </label>
                        {loading ? (
                            <div className="p-3 bg-gray-100 rounded text-gray-600">Loading employees...</div>
                        ) : (
                            <select
                                value={formData.assignedTo}
                                onChange={handleEmployeeSelect}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={submitting || employees.length === 0}
                            >
                                <option value="">-- Select Employee --</option>
                                {employees.map(emp => (
                                    <option key={emp._id} value={emp._id}>
                                        {emp.name} ({emp.employeeId}) - {emp.email}
                                    </option>
                                ))}
                            </select>
                        )}
                        {employees.length === 0 && !loading && (
                            <p className="text-sm text-red-600 mt-1">No employees found</p>
                        )}
                    </div>

                    {/* Priority & Deadline Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">
                                Priority
                            </label>
                            <select
                                name="priority"
                                value={formData.priority}
                                onChange={handleInputChange}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={submitting}
                            >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">
                                Deadline *
                            </label>
                            <input
                                type="date"
                                name="deadline"
                                value={formData.deadline}
                                onChange={handleInputChange}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={submitting}
                            />
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader size={18} className="animate-spin" />
                                Assigning...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                Assign Task
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
