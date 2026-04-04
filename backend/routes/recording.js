import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import Recording from "../models/Recording.js";
import Task from "../models/Task.js";
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
        const task = new Task({
          task: taskData.task,
          person: taskData.person,
          deadline: taskData.deadline,
          priority: taskData.priority || "Low",
          owner: recording.userId
        });
        await task.save();
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
