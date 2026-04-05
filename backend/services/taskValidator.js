import Task from "../models/Task.js";
import User from "../models/User.js";

/**
 * Task Validation Service
 * Handles empid-based validation, duplicate detection, and inconsistency flagging
 */

// Normalize task name for comparison
const normalizeTaskName = (name) => {
    return name.toLowerCase().trim().replace(/\s+/g, " ");
};

/**
 * Detect duplicate name mappings for an empId
 */
export const detectDuplicateNames = async (empId, taskName, excludeTaskId = null) => {
    const normalizedName = normalizeTaskName(taskName);
    
    const query = {
        empId,
        isFinalized: false,
        canDelete: true
    };
    
    if (excludeTaskId) {
        query._id = { $ne: excludeTaskId };
    }
    
    const existingTasks = await Task.find(query);
    
    const duplicates = existingTasks.filter(task => {
        const existingNormalized = task.nameMapping?.normalizedName || 
                                    normalizeTaskName(task.taskName);
        return existingNormalized === normalizedName;
    });
    
    return {
        hasDuplicates: duplicates.length > 0,
        count: duplicates.length,
        duplicateTasks: duplicates.map(task => ({
            taskId: task._id,
            empId: task.empId,
            taskName: task.taskName,
            status: task.status
        }))
    };
};

/**
 * Validate task data before creation/update
 */
export const validateTaskData = async (taskData, isUpdate = false, excludeTaskId = null) => {
    const errors = [];
    const warnings = [];
    
    // Validate required fields
    if (!taskData.taskName || taskData.taskName.trim() === "") {
        errors.push("Task name is required");
    }
    
    if (!taskData.empId || taskData.empId.trim() === "") {
        errors.push("Employee ID is required");
    }
    
    if (!taskData.assignedTo) {
        errors.push("Task must be assigned to an employee");
    }
    
    if (!taskData.deadline) {
        errors.push("Deadline is required");
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Ignore time component
        const deadlineDate = new Date(taskData.deadline);
        if (!isNaN(deadlineDate.getTime()) && deadlineDate < today) {
            // Ignore natural language dates like "tomorrow"
            errors.push("Deadline cannot be in the past");
        }
    }
    
    // Check for duplicate names under same empId
    if (taskData.empId && taskData.taskName) {
        const dupCheck = await detectDuplicateNames(
            taskData.empId,
            taskData.taskName,
            excludeTaskId
        );
        
        if (dupCheck.hasDuplicates) {
            warnings.push({
                type: "duplicate_name",
                message: `Found ${dupCheck.count} existing task(s) with similar name for empId: ${taskData.empId}`,
                duplicates: dupCheck.duplicateTasks
            });
        }
    }
    
    // Validate employee exists
    if (taskData.assignedTo) {
        const employee = await User.findById(taskData.assignedTo);
        if (!employee) {
            errors.push("Assigned employee not found");
        } else if (employee.employeeId !== taskData.empId) {
            errors.push(`Employee ID mismatch: provided ${taskData.empId} but user has ${employee.employeeId}`);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * Check for inconsistencies in a task
 */
export const checkInconsistencies = async (task) => {
    const inconsistencies = [];
    
    // Check empId-name consistency
    const assignee = await User.findById(task.assignedTo);
    if (assignee && assignee.empId !== task.empId) {
        inconsistencies.push({
            type: "empid_mismatch",
            description: `Task empId (${task.empId}) doesn't match assigned user empId (${assignee.empId})`,
            severity: "critical"
        });
    }
    
    // Check for duplicate names if not already recorded
    const dupCheck = await detectDuplicateNames(task.empId, task.taskName, task._id);
    if (dupCheck.hasDuplicates && !task.inconsistencies.some(i => i.type === "duplicate_name")) {
        inconsistencies.push({
            type: "duplicate_name",
            description: `Found ${dupCheck.count} similar task(s) for this empId`,
            severity: "warning"
        });
    }
    
    // Check status conflicts
    if (task.employeeMarkedComplete && task.status !== "completed") {
        inconsistencies.push({
            type: "status_conflict",
            description: "Employee marked complete but status is not 'completed'",
            severity: "warning"
        });
    }
    
    return inconsistencies;
};

/**
 * Flag inconsistencies to admin
 */
export const flagInconsistencies = async (taskId, flaggedBy) => {
    try {
        const task = await Task.findById(taskId);
        if (!task) {
            throw new Error("Task not found");
        }
        
        const inconsistencies = await checkInconsistencies(task);
        
        if (inconsistencies.length > 0) {
            // Add flagged inconsistencies to task
            inconsistencies.forEach(inc => {
                task.inconsistencies.push({
                    ...inc,
                    flaggedAt: new Date(),
                    flaggedBy
                });
            });
            
            await task.save();
        }
        
        return {
            flagged: inconsistencies.length > 0,
            count: inconsistencies.length,
            inconsistencies
        };
    } catch (error) {
        console.error("Error flagging inconsistencies:", error);
        throw error;
    }
};

/**
 * Validate task before finalization
 * Forces resolution of conflicts before allowing finalization
 */
export const validateBeforeFinalization = async (taskId, adminId) => {
    try {
        const task = await Task.findById(taskId);
        if (!task) {
            throw new Error("Task not found");
        }
        
        // Check if there are unresolved inconsistencies
        const unresolvedInconsistencies = task.inconsistencies.filter(i => !i.resolved);
        
        if (unresolvedInconsistencies.length > 0) {
            return {
                canFinalize: false,
                message: "Task has unresolved conflicts. Admin must resolve before finalization.",
                inconsistencies: unresolvedInconsistencies,
                requiresAdminApproval: true
            };
        }
        
        // Check namemapping duplicates
        if (task.nameMapping?.duplicatesDetected && task.nameMapping.duplicatesDetected.length > 0) {
            return {
                canFinalize: false,
                message: "Task has duplicate name mappings. Must be resolved by admin.",
                duplicates: task.nameMapping.duplicatesDetected,
                requiresAdminApproval: true
            };
        }
        
        return {
            canFinalize: true,
            message: "Task is ready for finalization"
        };
    } catch (error) {
        console.error("Error validating before finalization:", error);
        throw error;
    }
};

/**
 * Resolve a conflict and prepare task for finalization
 */
export const resolveConflict = async (taskId, adminId, resolutionNotes, action = "resolve") => {
    try {
        const task = await Task.findById(taskId);
        if (!task) {
            throw new Error("Task not found");
        }
        
        // If task is unassigned, try to assign it based on assignedToName
        if (!task.assignedTo && task.assignedToName) {
            const user = await User.findOne({ name: task.assignedToName });
            if (user) {
                task.assignedTo = user._id;
                task.empId = user.employeeId;
                task.assignmentStatus = "assigned";
                
                // Remove the "name_not_found" inconsistency if it exists
                task.inconsistencies = task.inconsistencies.filter(
                    inc => inc.type !== "name_not_found"
                );
            }
        }
        
        // Mark remaining inconsistencies as resolved by admin
        task.inconsistencies.forEach(inc => {
            inc.resolved = true;
            inc.resolvedAt = new Date();
            inc.resolvedBy = adminId;
        });
        
        task.conflictResolverId = adminId;
        task.resolutionNotes = resolutionNotes;
        task.lastModifiedBy = adminId;
        task.lastModifiedAt = new Date();
        
        if (action === "finalize") {
            task.isFinalized = true;
        }
        
        await task.save();
        
        return {
            success: true,
            message: "Conflict resolved successfully",
            task
        };
    } catch (error) {
        console.error("Error resolving conflict:", error);
        throw error;
    }
};

/**
 * Get all unresolved conflicts for admin dashboard
 */
export const getUnresolvedConflicts = async (filters = {}) => {
    try {
        const query = {
            "inconsistencies.0": { $exists: true },
            isFinalized: false
        };
        
        if (filters.severity) {
            query["inconsistencies.severity"] = filters.severity;
        }
        
        if (filters.empId) {
            query.empId = filters.empId;
        }
        
        const conflicts = await Task.find(query)
            .populate("assignedTo", "name empId email")
            .populate("assignedBy", "name email")
            .populate("inconsistencies.flaggedBy", "name email")
            .sort({ "inconsistencies.flaggedAt": -1 })
            .limit(filters.limit || 100);
        
        return conflicts;
    } catch (error) {
        console.error("Error fetching unresolved conflicts:", error);
        throw error;
    }
};

/**
 * Get task statistics for admin dashboard
 */
export const getTaskStatistics = async () => {
    try {
        const stats = {
            totalTasks: await Task.countDocuments({ isFinalized: false }),
            tasksWithConflicts: await Task.countDocuments({ "inconsistencies.0": { $exists: true } }),
            criticalConflicts: await Task.countDocuments({ "inconsistencies.severity": "critical" }),
            completedTasks: await Task.countDocuments({ status: "completed", isFinalized: true }),
            pendingFinalization: await Task.countDocuments({ isFinalized: false, inconsistencies: { $size: 0 } })
        };
        
        return stats;
    } catch (error) {
        console.error("Error fetching task statistics:", error);
        throw error;
    }
};
