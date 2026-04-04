import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle,
  Trash2,
  Eye,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function AdminTaskDashboard() {
  const [stats, setStats] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolveAction, setResolveAction] = useState("resolve_only");

  const token = localStorage.getItem("token");
  const api = axios.create({
    baseURL: "http://localhost:5000",
    headers: { Authorization: `Bearer ${token}` },
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
        api.get("/api/tasks?hasConflicts=true"),
        api.get("/api/admin/conflicts"),
      ]);

      setStats(statsRes.data);
      setTasks(tasksRes.data);
      setConflicts(conflictsRes.data.conflicts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredData =
    filterMode === "conflicts"
      ? conflicts
      : filterMode === "critical"
        ? conflicts.filter((t) =>
            t.inconsistencies.some((i) => i.severity === "critical"),
          )
        : tasks;

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center text-lg font-semibold">
        Loading dashboard...
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-blue-600" />
            <h1 className="text-3xl font-bold">Admin Task Dashboard</h1>
          </div>
          <Button onClick={fetchDashboardData} className="gap-2">
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {[
              { label: "Total Tasks", value: stats.stats.totalTasks },
              {
                label: "With Conflicts",
                value: stats.stats.tasksWithConflicts,
              },
              {
                label: "Critical Issues",
                value: stats.stats.criticalConflicts,
              },
              { label: "Completed", value: stats.stats.completedTasks },
              {
                label: "Pending Finalization",
                value: stats.stats.pendingFinalization,
              },
            ].map((item, i) => (
              <Card key={i} className="shadow-md hover:shadow-xl transition">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">{item.label}</p>
                  <p className="text-3xl font-bold mt-2">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3">
          {["all", "conflicts", "critical"].map((mode) => (
            <Button
              key={mode}
              variant={filterMode === mode ? "default" : "outline"}
              onClick={() => setFilterMode(mode)}
              className="capitalize"
            >
              {mode}
            </Button>
          ))}
        </div>

        {/* Task Cards */}
        <div className="grid gap-6">
          {filteredData.map((task) => (
            <motion.div
              key={task._id}
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-2xl shadow-lg border p-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold">{task.taskName}</h3>
                  <p className="text-sm text-gray-500">EmpID: {task.empId}</p>
                </div>
                <span className="text-sm font-semibold px-3 py-1 bg-slate-100 rounded-full">
                  {task.priority} Priority
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-gray-500">Assigned To</p>
                  <p className="font-medium">{task.assignedTo?.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Deadline</p>
                  <p className="font-medium">
                    {new Date(task.deadline).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Finalized</p>
                  <p className="font-medium">
                    {task.isFinalized ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Can Delete</p>
                  <p className="font-medium">{task.canDelete ? "Yes" : "No"}</p>
                </div>
              </div>

              {task.inconsistencies?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {task.inconsistencies.map((inc, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 items-start bg-red-50 border border-red-200 rounded-lg p-3"
                    >
                      <AlertTriangle size={16} className="text-red-600" />
                      <div>
                        <p className="font-semibold text-red-700">
                          {inc.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-red-600">
                          {inc.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <Button className="gap-2" onClick={() => setSelectedTask(task)}>
                  <CheckCircle size={16} /> Resolve
                </Button>
                <Button variant="destructive" className="gap-2">
                  <Trash2 size={16} /> Delete
                </Button>
                <Button variant="outline" className="gap-2">
                  <Eye size={16} /> Details
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
