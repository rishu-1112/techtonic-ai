import express from "express";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import {
    getUnresolvedConflicts,
    getTaskStatistics,
    checkInconsistencies,
    resolveConflict
} from "../services/taskValidator.js";
import { sendTaskEmail } from "../services/mailer.js";

const router = express.Router();

// Middleware: Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

/**
 * GET /api/admin/dashboard/overview - Get dashboard overview statistics
 */
router.get("/dashboard/overview", requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = await getTaskStatistics();
        
        // Get breakdown by priority
        const priorityBreakdown = await Task.aggregate([
            { $match: { isFinalized: false } },
            { $group: { _id: "$priority", count: { $sum: 1 } } }
        ]);
        
        // Get breakdown by status
        const statusBreakdown = await Task.aggregate([
            { $match: { isFinalized: false } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        
        // Get most active employees
        const activeEmployees = await Task.aggregate([
            {
                $group: {
                    _id: "$empId",
                    taskCount: { $sum: 1 },
                    conflictCount: {
                        $sum: {
                            $cond: [{ $gt: [{ $size: "$inconsistencies" }, 0] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { conflictCount: -1, taskCount: -1 } },
            { $limit: 10 }
        ]);
        
        res.json({
            stats,
            priorityBreakdown,
            statusBreakdown,
            activeEmployees
        });
    } catch (error) {
        console.error("Error fetching dashboard overview:", error);
        res.status(500).json({ error: "Failed to fetch overview", details: error.message });
    }
});

/**
 * GET /api/admin/conflicts - Get all unresolved conflicts
 */
router.get("/conflicts", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { severity, sortBy, limit, skip } = req.query;
        
        const filters = {
            severity,
            limit: parseInt(limit) || 50,
            skip: parseInt(skip) || 0
        };
        
        const conflicts = await getUnresolvedConflicts(filters);
        const total = await Task.countDocuments({
            "inconsistencies.0": { $exists: true },
            isFinalized: false
        });
        
        // Sort if needed
        let sorted = conflicts;
        if (sortBy === "critical") {
            sorted = conflicts.sort((a, b) => {
                const aCritical = a.inconsistencies.filter(i => i.severity === "critical").length;
                const bCritical = b.inconsistencies.filter(i => i.severity === "critical").length;
                return bCritical - aCritical;
            });
        } else if (sortBy === "recent") {
            sorted = conflicts.sort((a, b) => {
                const aDate = a.inconsistencies[0]?.flaggedAt || new Date(0);
                const bDate = b.inconsistencies[0]?.flaggedAt || new Date(0);
                return new Date(bDate) - new Date(aDate);
            });
        }
        
        res.json({
            total,
            count: sorted.length,
            conflicts: sorted.slice(filters.skip, filters.skip + filters.limit)
        });
    } catch (error) {
        console.error("Error fetching conflicts:", error);
        res.status(500).json({ error: "Failed to fetch conflicts", details: error.message });
    }
});

/**
 * GET /api/admin/conflicts/critical - Get critical conflicts only
 */
router.get("/conflicts/critical", requireAuth, requireAdmin, async (req, res) => {
    try {
        const criticalConflicts = await Task.find({
            "inconsistencies.severity": "critical",
            isFinalized: false
        })
            .populate("assignedTo", "name empId email")
            .populate("assignedBy", "name email")
            .populate("inconsistencies.flaggedBy", "name email")
            .sort({ "inconsistencies.flaggedAt": -1 });
        
        res.json({
            count: criticalConflicts.length,
            conflicts: criticalConflicts
        });
    } catch (error) {
        console.error("Error fetching critical conflicts:", error);
        res.status(500).json({ error: "Failed to fetch critical conflicts", details: error.message });
    }
});

/**
 * GET /api/admin/conflicts/:taskId - Get details of a specific conflict
 */
router.get("/conflicts/:taskId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate("assignedTo", "name empId email")
            .populate("assignedBy", "name email")
            .populate("conflictResolverId", "name email")
            .populate("inconsistencies.flaggedBy", "name email")
            .populate("inconsistencies.resolvedBy", "name email");
        
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        // Get similar tasks to understand the duplicate/conflict better
        let similarTasks = [];
        if (task.nameMapping?.duplicatesDetected?.length > 0) {
            similarTasks = await Task.find({
                _id: { $in: task.nameMapping.duplicatesDetected.map(d => d.taskId) }
            }).select("taskName empId status priority");
        }
        
        res.json({
            task,
            similarTasks,
            conflictDetails: {
                totalInconsistencies: task.inconsistencies.length,
                criticalCount: task.inconsistencies.filter(i => i.severity === "critical").length,
                warnings: task.inconsistencies.filter(i => i.severity === "warning")
            }
        });
    } catch (error) {
        console.error("Error fetching conflict details:", error);
        res.status(500).json({ error: "Failed to fetch conflict details", details: error.message });
    }
});

/**
 * PATCH /api/admin/conflicts/:taskId/approve - Approve and resolve conflict
 */
router.patch("/conflicts/:taskId/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { resolutionNotes, action } = req.body;
        
        // action can be "resolve_only" or "resolve_and_finalize"
        const result = await resolveConflict(
            req.params.taskId,
            req.user.id,
            resolutionNotes,
            action === "resolve_and_finalize" ? "finalize" : "resolve"
        );
        
        // Emit real-time notification
        if (req.app.locals.io) {
            req.app.locals.io.of("/admin-tasks").emit("conflict_approved", {
                taskId: req.params.taskId,
                resolvedBy: req.user.name,
                action,
                timestamp: new Date()
            });
        }
        
        // Send email to the user if a user is assigned
        try {
            const populatedTask = await Task.findById(req.params.taskId)
                .populate("assignedTo", "name email");
            
            if (populatedTask && populatedTask.assignedTo) {
                console.log("📧 Sending conflict resolution email to:", populatedTask.assignedTo.email);
                await sendTaskEmail({
                    taskName: populatedTask.taskName || populatedTask.task,
                    empId: populatedTask.empId,
                    deadline: populatedTask.deadline,
                    priority: populatedTask.priority || "Low",
                    description: populatedTask.description || "Task assigned after conflict resolution.",
                    assignedToEmail: populatedTask.assignedTo.email,
                    assignedToName: populatedTask.assignedTo.name,
                    assignedByName: req.user.name,
                    isNewAssignment: true,
                    conflictResolved: true
                });
                console.log("✅ Email sent successfully!");
            }
        } catch (mailError) {
            console.error("Error sending resolution email:", mailError);
        }
        
        res.json({
            message: "Conflict approved and resolved",
            ...result
        });
    } catch (error) {
        console.error("Error approving conflict:", error);
        res.status(500).json({ error: "Failed to approve conflict", details: error.message });
    }
});

/**
 * PATCH /api/admin/conflicts/:taskId/reject - Reject conflict approval and send back
 */
router.patch("/conflicts/:taskId/reject", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { reason, actionRequired } = req.body;
        
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        task.inconsistencies.forEach(inc => {
            inc.reviewed = true;
            inc.reviewedBy = req.user.id;
            inc.reviewReason = reason;
        });
        
        task.lastModifiedBy = req.user.id;
        task.lastModifiedAt = new Date();
        
        await task.save();
        
        // Notify assignee
        if (req.app.locals.io) {
            req.app.locals.io.of("/employee-tasks").to(`user_${task.assignedTo}`).emit("conflict_review_needed", {
                taskId: task._id,
                reason,
                actionRequired
            });
        }
        
        res.json({
            message: "Conflict review rejected, employee notified",
            task
        });
    } catch (error) {
        console.error("Error rejecting conflict:", error);
        res.status(500).json({ error: "Failed to reject conflict", details: error.message });
    }
});

/**
 * GET /api/admin/employees - Get all employees for admin view
 */
router.get("/employees", requireAuth, requireAdmin, async (req, res) => {
    try {
        const employees = await User.find({ role: "employee" })
            .select("_id name empId email isActive")
            .lean();
        
        // Get task count for each employee
        const taskCounts = await Task.aggregate([
            { $match: { isFinalized: false } },
            {
                $group: {
                    _id: "$empId",
                    taskCount: { $sum: 1 },
                    conflictCount: {
                        $sum: {
                            $cond: [{ $gt: [{ $size: "$inconsistencies" }, 0] }, 1, 0]
                        }
                    }
                }
            }
        ]);
        
        const employeesWithStats = employees.map(emp => {
            const stats = taskCounts.find(tc => tc._id === emp.empId);
            return {
                ...emp,
                taskCount: stats?.taskCount || 0,
                conflictCount: stats?.conflictCount || 0
            };
        });
        
        res.json(employeesWithStats);
    } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({ error: "Failed to fetch employees", details: error.message });
    }
});

/**
 * GET /api/admin/employees/:empId/conflicts - Get conflicts for specific employee
 */
router.get("/employees/:empId/conflicts", requireAuth, requireAdmin, async (req, res) => {
    try {
        const conflicts = await Task.find({
            empId: req.params.empId,
            "inconsistencies.0": { $exists: true },
            isFinalized: false
        })
            .populate("assignedTo", "name empId email")
            .populate("inconsistencies.flaggedBy", "name email")
            .sort({ "inconsistencies.flaggedAt": -1 });
        
        res.json({
            empId: req.params.empId,
            count: conflicts.length,
            conflicts
        });
    } catch (error) {
        console.error("Error fetching employee conflicts:", error);
        res.status(500).json({ error: "Failed to fetch employee conflicts", details: error.message });
    }
});

/**
 * GET /api/admin/reports/duplicates - Get all duplicate name issues
 */
router.get("/reports/duplicates", requireAuth, requireAdmin, async (req, res) => {
    try {
        const duplicates = await Task.find({
            "nameMapping.duplicatesDetected.0": { $exists: true },
            isFinalized: false
        })
            .select("empId taskName nameMapping inconsistencies")
            .populate("assignedTo", "name empId email");
        
        // Group by empId and normalized name
        const grouped = {};
        duplicates.forEach(task => {
            const key = `${task.empId}::${task.nameMapping.normalizedName}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(task);
        });
        
        const report = Object.entries(grouped)
            .map(([key, tasks]) => {
                const [empId, name] = key.split("::");
                return {
                    empId,
                    taskName: name,
                    duplicateCount: tasks.length,
                    tasks: tasks.map(t => ({
                        id: t._id,
                        taskName: t.taskName,
                        status: t.status,
                        hasConflicts: t.inconsistencies.length > 0
                    }))
                };
            })
            .sort((a, b) => b.duplicateCount - a.duplicateCount);
        
        res.json({
            total: report.reduce((sum, item) => sum + item.duplicateCount, 0),
            groups: report
        });
    } catch (error) {
        console.error("Error fetching duplicate report:", error);
        res.status(500).json({ error: "Failed to fetch duplicate report", details: error.message });
    }
});

/**
 * POST /api/admin/bulk-action - Perform bulk actions on tasks
 */
router.post("/bulk-action", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { action, taskIds, resolutionNotes } = req.body;
        
        if (!["resolve_all", "delete_all", "finalize_all"].includes(action)) {
            return res.status(400).json({ error: "Invalid bulk action" });
        }
        
        let results = {
            successful: [],
            failed: []
        };
        
        for (const taskId of taskIds) {
            try {
                const task = await Task.findById(taskId);
                if (!task) {
                    results.failed.push({ taskId, reason: "Task not found" });
                    continue;
                }
                
                if (action === "resolve_all") {
                    task.inconsistencies.forEach(inc => {
                        inc.resolved = true;
                        inc.resolvedAt = new Date();
                        inc.resolvedBy = req.user.id;
                    });
                    task.conflictResolverId = req.user.id;
                    task.resolutionNotes = resolutionNotes;
                } else if (action === "finalize_all") {
                    task.isFinalized = true;
                    task.inconsistencies.forEach(inc => {
                        inc.resolved = true;
                        inc.resolvedAt = new Date();
                        inc.resolvedBy = req.user.id;
                    });
                } else if (action === "delete_all") {
                    await Task.findByIdAndDelete(taskId);
                    results.successful.push({
                        taskId,
                        action: "deleted"
                    });
                    continue;
                }
                
                await task.save();
                results.successful.push({
                    taskId,
                    action: "completed"
                });
            } catch (err) {
                results.failed.push({ taskId, reason: err.message });
            }
        }
        
        res.json({
            action,
            results
        });
    } catch (error) {
        console.error("Error performing bulk action:", error);
        res.status(500).json({ error: "Failed to perform bulk action", details: error.message });
    }
});

export default router;
