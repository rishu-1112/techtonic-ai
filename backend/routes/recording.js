import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import Recording from "../models/Recording.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import multer from "multer";
import path from "path";

const router = express.Router();
const upload = multer({ dest: "./uploads/" });

// POST - Start a recording
router.post("/start", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.body;
    
    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID required" });
    }

    const recording = new Recording({
      meetingId,
      userId: req.user.id,
      status: "recording"
    });

    await recording.save();
    res.json({ ...recording.toObject(), message: "Recording started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - End and upload recording
router.post("/upload", requireAuth, upload.single("audio"), async (req, res) => {
  try {
    const { meetingId, duration } = req.body;

    if (!meetingId || !req.file) {
      return res.status(400).json({ error: "Meeting ID and audio file required" });
    }

    // Find existing recording or create new one
    let recording = await Recording.findOne({ meetingId, userId: req.user.id });

    if (!recording) {
      recording = new Recording({
        meetingId,
        userId: req.user.id,
        status: "recording"
      });
    }

    recording.filePath = req.file.path;
    recording.duration = parseInt(duration) || 0;
    recording.status = "processing";
    await recording.save();

    // Send to AI service for processing
    processRecordingAsync(recording._id, req.file.path);

    res.json({ 
      recordingId: recording._id, 
      message: "Recording received, processing started" 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process recording asynchronously
async function processRecordingAsync(recordingId, filePath) {
  try {
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(filePath));

    console.log("📤 Sending to AI Service at http://localhost:8000/process");
    
    const aiRes = await axios.post(
      "http://localhost:8000/process",
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 300000 // 5 minutes for processing
      }
    );

    console.log("🧠 AI Response:", aiRes.data);

    const recording = await Recording.findById(recordingId);
    recording.transcription = aiRes.data.text || "";
    recording.processingResult = aiRes.data;
    recording.status = "completed";

    // Extract tasks from the response
    if (aiRes.data.tasks && Array.isArray(aiRes.data.tasks)) {
      recording.extractedTasks = aiRes.data.tasks;

      // Save tasks to database
      for (const taskData of aiRes.data.tasks) {
        const personName = taskData.assignedTo;
        const taskName = taskData.task;
        const deadline = taskData.deadline;
        
        const inconsistencies = [];
        
        // Validate required fields
        if (!taskName || taskName.trim() === "") {
          inconsistencies.push({
            type: "missing_task_name",
            description: "Task name is missing or empty",
            severity: "critical",
            flaggedAt: new Date(),
            flaggedBy: recording.userId,
            resolved: false
          });
        }
        
        if (!deadline || deadline.trim() === "") {
          inconsistencies.push({
            type: "missing_deadline",
            description: "Deadline is missing or empty",
            severity: "critical",
            flaggedAt: new Date(),
            flaggedBy: recording.userId,
            resolved: false
          });
        }
        
        if (!personName || personName.trim() === "") {
          inconsistencies.push({
            type: "missing_assigned_to",
            description: "Assigned person is missing or empty",
            severity: "critical",
            flaggedAt: new Date(),
            flaggedBy: recording.userId,
            resolved: false
          });
        }
        
        // Find user by name
        let user = null;
        if (personName && personName.trim() !== "") {
          user = await User.findOne({ name: personName });
          if (!user) {
            inconsistencies.push({
              type: "missing_assigned_to",
              description: `User with name "${personName}" not found in database`,
              severity: "critical",
              flaggedAt: new Date(),
              flaggedBy: recording.userId,
              resolved: false
            });
          }
        }
        
        const taskFields = {
          taskName: taskName || "Untitled Task",
          assignedBy: recording.userId,
          deadline: deadline || "No deadline",
          priority: taskData.priority || "Low",
          description: taskName || "Task assigned from meeting",
          assignedToName: personName,
          meetingId: recording.meetingId || "",
          recordingId: recording._id,
          inconsistencies: inconsistencies
        };
        
        if (user) {
          taskFields.assignedTo = user._id;
          taskFields.empId = user.employeeId;
          taskFields.assignmentStatus = "assigned";
        } else {
          taskFields.assignmentStatus = "unassigned";
        }
        
        const task = new Task(taskFields);
        await task.save();
        console.log("📌 Task saved:", { taskName, assignedTo: personName, conflicts: inconsistencies.length });
      }
    }

    await recording.save();
    console.log("✅ Recording processed and saved!");

  } catch (err) {
    console.error("❌ Error processing recording:", err.message);
    const recording = await Recording.findById(recordingId);
    recording.status = "failed";
    recording.errorMessage = err.message;
    await recording.save();
  }
}

// GET - Get recording details
router.get("/:recordingId", requireAuth, async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.recordingId);
    
    if (!recording) {
      return res.status(404).json({ error: "Recording not found" });
    }

    if (recording.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(recording);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Get all recordings for user
router.get("/", requireAuth, async (req, res) => {
  try {
    const recordings = await Recording.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(recordings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
