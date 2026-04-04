import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
    taskName: {
        type: String,
        required: true,
        trim: true
    },
    empId: {
        type: String,
        required: true,
        trim: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    deadline: {
        type: Date,
        required: true
    },
    priority: {
        type: String,
        enum: ["Low", "Medium", "High"],
        default: "Low"
    },
    status: {
        type: String,
        enum: ["pending", "in-progress", "completed", "blocked"],
        default: "pending"
    },
    description: {
        type: String,
        default: ""
    },
    
    // Validation & Conflict Tracking
    nameMapping: {
        originalName: String,
        normalizedName: String,
        duplicatesDetected: [{
            taskId: mongoose.Schema.Types.ObjectId,
            empId: String,
            taskName: String
        }]
    },
    
    inconsistencies: [{
        type: {
            type: String,
            enum: ["duplicate_name", "empid_mismatch", "name_change", "status_conflict"],
        },
        description: String,
        flaggedAt: Date,
        flaggedBy: mongoose.Schema.Types.ObjectId,
        severity: {
            type: String,
            enum: ["warning", "critical"],
            default: "warning"
        }
    }],
    
    isFinalized: {
        type: Boolean,
        default: false
    },
    
    conflictResolverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    
    resolutionNotes: String,
    
    // Real-time tracking
    lastModifiedBy: mongoose.Schema.Types.ObjectId,
    lastModifiedAt: Date,
    
    // Employee actions
    employeeMarkedComplete: {
        type: Boolean,
        default: false
    },
    
    employeeMarkedCompleteAt: Date,
    
    canDelete: {
        type: Boolean,
        default: true
    },
    
    deletionReason: String,
    
    deletedAt: Date,
    
    deletedBy: mongoose.Schema.Types.ObjectId,
    
}, { timestamps: true });

// Index for efficient empid-based queries
taskSchema.index({ empId: 1, taskName: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ isFinalized: 1 });
taskSchema.index({ "inconsistencies.type": 1 });

export default mongoose.model("Task", taskSchema);