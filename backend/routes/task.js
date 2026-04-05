import express from "express";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { sendTaskEmail } from "../services/mailer.js";
import {
    validateTaskData,
    detectDuplicateNames,
    flagInconsistencies,
    validateBeforeFinalization,
    resolveConflict,
    getUnresolvedConflicts,
    checkInconsistencies,
    getTaskStatistics
} from "../services/taskValidator.js";
import { emitTaskUpdate, sendAdminAlert } from "../services/socketService.js";

const router = express.Router();

// Middleware: Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

// Middleware: Check if user is employee
const requireEmployee = (req, res, next) => {
    if (req.user.role !== "employee") {
        return res.status(403).json({ error: "Employee access required" });
    }
    next();
};

/**
 * POST /api/tasks/create - Create a new task (Admin only)
 */
router.post("/create", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { taskName, empId, assignedTo, deadline, priority, description } = req.body;
        
        // Validate task data
        const validation = await validateTaskData({
            taskName,
            empId,
            assignedTo,
            deadline,
            priority,
            description
        });
        
        if (!validation.isValid) {
            return res.status(400).json({
                error: "Validation failed",
                errors: validation.errors
            });
        }
        
        // Check for duplicates
        const dupCheck = await detectDuplicateNames(empId, taskName);
        
        // Create task
        const task = new Task({
            taskName,
            empId,
            assignedTo,
            assignedBy: req.user.id,
            deadline,
            priority,
            description,
            nameMapping: {
                originalName: taskName,
                normalizedName: taskName.toLowerCase().trim().replace(/\s+/g, " "),
                duplicatesDetected: dupCheck.duplicateTasks
            }
        });
        
        // If duplicates found, flag as warning inconsistency
        if (dupCheck.hasDuplicates) {
            task.inconsistencies.push({
                type: "duplicate_name",
                description: `Found ${dupCheck.count} similar task(s) for empId ${empId}`,
                severity: "warning",
                flaggedAt: new Date(),
                flaggedBy: req.user.id
            });
        }
        
        await task.save();
        
        // Populate references
        await task.populate("assignedTo", "name empId email");
        await task.populate("assignedBy", "name email");
        
        // Emit real-time update
        if (req.app.locals.io) {
            emitTaskUpdate(req.app.locals.io, task._id, "task_created", {
                task: task.toObject(),
                message: "New task created"
            });
        }
        
        res.status(201).json({
            message: "Task created successfully",
            task,
            warnings: validation.warnings.length > 0 ? validation.warnings : null
        });
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ error: "Failed to create task", details: error.message });
    }
});

/**
 * GET /api/tasks - Get all tasks (with filtering)
 */
router.get("/", requireAuth, async (req, res) => {
    try {
        const { status, empId, assignedTo, hasConflicts } = req.query;
        let query = {};
        
        // Employees can only see their own tasks
        if (req.user.role === "employee") {
            query.assignedTo = req.user.id;
        }
        
        // Apply filters
        if (status) query.status = status;
        if (empId) query.empId = empId;
        if (assignedTo) query.assignedTo = assignedTo;
        if (hasConflicts === "true") {
            query["inconsistencies.0"] = { $exists: true };
        }
        
        const tasks = await Task.find(query)
            .populate("assignedTo", "name empId email")
            .populate("assignedBy", "name email")
            .sort({ createdAt: -1 });
        
        res.json(tasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
    }
});

/**
 * GET /api/tasks/:id - Get task details
 */
router.get("/:id", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate("assignedTo", "name empId email role")
            .populate("assignedBy", "name email")
            .populate("conflictResolverId", "name email")
            .populate("inconsistencies.flaggedBy", "name email");
        
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        // Check authorization
        if (req.user.role === "employee" && task.assignedTo._id.toString() !== req.user.id) {
            return res.status(403).json({ error: "You don't have access to this task" });
        }
        
        res.json(task);
    } catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).json({ error: "Failed to fetch task", details: error.message });
    }
});

/**
 * PATCH /api/tasks/:id/status - Update task status
 * Employees: Can only mark as in-progress or mark complete
 * Admins: Can set any status
 */
router.patch("/:id/status", requireAuth, async (req, res) => {
    try {
        const { newStatus } = req.body;
        const validStatuses = ["pending", "in-progress", "completed", "blocked"];
        
        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ error: "Invalid status" });
        }
        
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        // Authorization checks
        if (req.user.role === "employee") {
            // Employees can only update their assigned tasks
            if (task.assignedTo.toString() !== req.user.id) {
                return res.status(403).json({ error: "You can only update your own tasks" });
            }
            
            // Employees can only update to in-progress or completed
            if (!["in-progress", "completed"].includes(newStatus)) {
                return res.status(403).json({ error: "Employees can only mark as in-progress or completed" });
            }
            
            if (newStatus === "completed") {
                task.employeeMarkedComplete = true;
                task.employeeMarkedCompleteAt = new Date();
            }
        }
        
        const oldStatus = task.status;
        task.status = newStatus;
        task.lastModifiedBy = req.user.id;
        task.lastModifiedAt = new Date();
        
        await task.save();
        
        // Check for status conflicts
        const inconsistencies = await checkInconsistencies(task);
        if (inconsistencies.length > 0 && req.user.role === "employee") {
            sendAdminAlert(req.app.locals.io, "status_conflict", {
                taskId: task._id,
                oldStatus,
                newStatus,
                employee: req.user.name,
                severity: "warning"
            });
        }
        
        // Emit real-time update
        if (req.app.locals.io) {
            emitTaskUpdate(req.app.locals.io, task._id, "task_status_updated", {
                taskId: task._id,
                oldStatus,
                newStatus,
                updatedBy: req.user.name,
                timestamp: new Date()
            });
        }
        
        res.json({
            message: "Task status updated",
            task
        });
    } catch (error) {
        console.error("Error updating task status:", error);
        res.status(500).json({ error: "Failed to update status", details: error.message });
    }
});

/**
 * DELETE /api/tasks/:id - Delete or soft-delete a task
 * Employees: Can request deletion
 * Admins: Can force delete (ADMIN ONLY)
 */
router.delete("/:id", requireAuth, async (req, res) => {
    try {
        const { reason } = req.body;
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        // Admin can force delete - PRIMARY OPERATION
        if (req.user.role === "admin") {
            const deleteReason = reason || "Deleted by admin";
            const deletedTask = await Task.findByIdAndDelete(req.params.id);
            
            if (!deletedTask) {
                return res.status(500).json({ error: "Failed to delete task from database" });
            }
            
            // Emit deletion event
            if (req.app.locals.io) {
                emitTaskUpdate(req.app.locals.io, task._id, "task_deleted", {
                    taskId: task._id,
                    reason: deleteReason,
                    deletedBy: req.user.name
                });
            }
            
            // Alert all admins
            if (req.app.locals.io) {
                sendAdminAlert(req.app.locals.io, "task_deleted", {
                    taskId: task._id,
                    reason: deleteReason,
                    deletedBy: req.user.name
                });
            }
            
            return res.json({
                message: "Task deleted successfully",
                deletedTask: deletedTask
            });
        }
        
        // Employees can request deletion (soft delete)
        if (req.user.role === "employee") {
            if (task.assignedTo.toString() !== req.user.id) {
                return res.status(403).json({ error: "You can only request deletion for your own tasks" });
            }
            
            task.canDelete = false;
            task.deletionReason = reason || "Employee requested deletion";
            task.deletedAt = new Date();
            task.deletedBy = req.user.id;
            
            await task.save();
            
            // Alert admins for approval
            if (req.app.locals.io) {
                sendAdminAlert(req.app.locals.io, "deletion_requested", {
                    taskId: task._id,
                    reason: reason || "Employee requested deletion",
                    employee: req.user.name,
                    severity: "info"
                });
            }
            
            return res.json({
                message: "Deletion request sent to admin",
                task
            });
        }
        
        // If user is neither admin nor employee
        return res.status(403).json({ error: "Unauthorized to delete tasks" });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
});

/** * PATCH /api/tasks/:id - Update task details (Admin only)
 */
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { taskName, empId, assignedTo, deadline, priority, description } = req.body;
        
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        // Update fields
        if (taskName !== undefined) task.taskName = taskName;
        if (empId !== undefined) task.empId = empId;
        if (assignedTo !== undefined) {
            task.assignedTo = assignedTo;
            task.assignmentStatus = assignedTo ? "assigned" : "unassigned";
            if (assignedTo) {
                const user = await User.findById(assignedTo);
                if (user) {
                    task.assignedToName = user.name;
                    task.empId = user.employeeId;
                }
            }
        }
        if (deadline !== undefined) task.deadline = deadline;
        if (priority !== undefined) task.priority = priority;
        if (description !== undefined) task.description = description;
        
        task.lastModifiedBy = req.user.id;
        task.lastModifiedAt = new Date();
        
        await task.save();
        await task.populate("assignedTo", "name empId email");
        await task.populate("assignedBy", "name email");
        
        // Emit real-time update
        if (req.app.locals.io) {
            emitTaskUpdate(req.app.locals.io, task._id, "task_updated", {
                task: task.toObject(),
                updatedBy: req.user.name
            });
        }
        
        // Send email notification if task is assigned (new or edited)
        if (task.assignedTo) {
            const isNewAssignment = assignedTo !== undefined && !task.assignedTo;
            try {
                await sendTaskEmail({
                    _id: task._id,
                    taskName: task.taskName,
                    empId: task.empId,
                    deadline: task.deadline,
                    priority: task.priority,
                    description: task.description,
                    status: task.status,
                    assignedByName: req.user.name,
                    assignedToEmail: task.assignedTo.email,
                    assignedToName: task.assignedTo.name,
                    isNewAssignment: isNewAssignment,
                    isTaskEdit: !isNewAssignment,
                    lastModifiedAt: task.lastModifiedAt
                });
                console.log(`✅ Email sent to ${task.assignedTo.email} for task: ${task.taskName}`);
            } catch (emailError) {
                console.warn(`⚠️ Email sending failed for task ${task._id}: ${emailError.message}`);
            }
        }
        
        res.json({
            message: "Task updated successfully",
            task
        });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
});

/** * PATCH /api/tasks/:id/assign - Assign task to employee (Admin only)
 */
router.patch("/:id/assign", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { assignedTo } = req.body;
        
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: "Task not found" });
        }
        
        const employee = await User.findById(assignedTo);
        if (!employee) {
            return res.status(404).json({ error: "Employee not found" });
        }
        
        // Check if empIds match
        if (employee.empId !== task.empId) {
            return res.status(400).json({
                error: "Employee ID mismatch",
                message: `Task empId (${task.empId}) doesn't match employee empId (${employee.empId})`
            });
        }
        
        task.assignedTo = assignedTo;
        task.assignedBy = req.user.id;
        task.lastModifiedBy = req.user.id;
        task.lastModifiedAt = new Date();
        
        await task.save();
        
        // Populate for response
        await task.populate("assignedTo", "name empId email");
        await task.populate("assignedBy", "name email");
        
        // Send email notification to employee
        try {
            await sendTaskEmail({
                _id: task._id,
                taskName: task.taskName,
                empId: task.empId,
                deadline: task.deadline,
                priority: task.priority,
                description: task.description,
                status: task.status,
                assignedByName: req.user.name,
                assignedToEmail: employee.email,
                assignedToName: employee.name,
                isNewAssignment: true
            });
        } catch (emailError) {
            console.warn("Email sending failed (non-blocking):", emailError.message);
        }
        
        // Notify employee via Socket.io
        if (req.app.locals.io) {
            req.app.locals.io.of("/employee-tasks").to(`user_${assignedTo}`).emit("task_assigned", {
                taskId: task._id,
                taskName: task.taskName,
                deadline: task.deadline,
                priority: task.priority,
                assignedBy: req.user.name,
                description: task.description
            });
            
            // Also join the employee to their task rooms
            req.app.locals.io.of("/employee-tasks").to(`user_${assignedTo}`).emit("join_task_room", task._id);
        }
        
        res.json({
            message: "Task assigned successfully",
            task,
            notificationSent: true
        });
    } catch (error) {
        console.error("Error assigning task:", error);
        res.status(500).json({ error: "Failed to assign task", details: error.message });
    }
});

/**
 * GET /api/tasks/:id/validate-finalization - Check if task can be finalized
 */
router.get("/:id/validate-finalization", requireAuth, requireAdmin, async (req, res) => {
    try {
        const validation = await validateBeforeFinalization(req.params.id, req.user.id);
        res.json(validation);
    } catch (error) {
        console.error("Error validating finalization:", error);
        res.status(500).json({ error: "Validation failed", details: error.message });
    }
});

/**
 * PATCH /api/tasks/:id/resolve-conflict - Resolve conflicts and optionally finalize
 */
router.patch("/:id/resolve-conflict", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { resolutionNotes, finalize } = req.body;
        
        const result = await resolveConflict(
            req.params.id,
            req.user.id,
            resolutionNotes,
            finalize ? "finalize" : "resolve"
        );
        
        // Emit resolution event
        if (req.app.locals.io) {
            emitTaskUpdate(req.app.locals.io, req.params.id, "conflict_resolved", {
                taskId: req.params.id,
                resolutionNotes,
                resolvedBy: req.user.name,
                isFinalized: finalize,
                timestamp: new Date()
            });
        }
        
        res.json(result);
    } catch (error) {
        console.error("Error resolving conflict:", error);
        res.status(500).json({ error: "Failed to resolve conflict", details: error.message });
    }
});

/**
 * GET /api/tasks/admin/conflicts - Get all unresolved conflicts (Admin dashboard)
 */
router.get("/admin/conflicts", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { severity, empId, limit } = req.query;
        
        const conflicts = await getUnresolvedConflicts({
            severity,
            empId,
            limit: parseInt(limit) || 100
        });
        
        res.json({
            count: conflicts.length,
            conflicts
        });
    } catch (error) {
        console.error("Error fetching conflicts:", error);
        res.status(500).json({ error: "Failed to fetch conflicts", details: error.message });
    }
});

/**
 * GET /api/tasks/admin/statistics - Get task statistics for admin dashboard
 */
router.get("/admin/statistics", requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = await getTaskStatistics();
        res.json(stats);
    } catch (error) {
        console.error("Error fetching statistics:", error);
        res.status(500).json({ error: "Failed to fetch statistics", details: error.message });
    }
});

export default router;
