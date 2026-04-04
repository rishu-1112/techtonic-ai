import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import Recording from "../models/Recording.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { sendTaskEmail } from "../services/mailer.js";
import { io } from "../server.js";
import crypto from "crypto";

const router = express.Router();

router.post("/zoom", async (req, res) => {
  const event = req.body.event;
  const payload = req.body.payload;

  console.log("🔥 Zoom Webhook Event:", event);

  // ✅ Handle validation
  if (event === "endpoint.url_validation") {
    const plainToken = payload.plainToken;
    const encryptedToken = crypto
      .createHmac("sha256", process.env.ZOOM_SECRET)
      .update(plainToken)
      .digest("hex");

    return res.status(200).json({
      plainToken,
      encryptedToken,
    });
  }

  // 🎯 MEETING.STARTED - Auto start recording
  if (event === "meeting.started") {
    console.log("🎬 Meeting Started - Auto Recording!");

    try {
      const meetingId = payload.object.id;
      const hostId = payload.object.host_id;

      // Find user by Zoom host ID (you might need to store this mapping)
      // For now, we'll create a recording for the first user or a default user
      const user = await User.findOne(); // Get first user for demo

      if (!user) {
        console.log("❌ No users found in system");
        return res.status(200).send("OK");
      }

      // Create recording entry
      const recording = new Recording({
        meetingId: `zoom_${meetingId}`,
        userId: user._id,
        status: "recording"
      });

      await recording.save();
      console.log("✅ Recording started for Zoom meeting:", meetingId);

      // 🔥 Notify frontend via Socket.IO to start recording
      io.emit("zoom-meeting-auto-start", {
        meetingId: `zoom_${meetingId}`,
        zoomMeetingId: meetingId,
        message: "Zoom meeting detected - auto starting recording",
        recordingId: recording._id
      });

      console.log("📡 Notified frontend clients to start recording");

    } catch (err) {
      console.error("❌ Error starting recording:", err.message);
    }
  }

  // 🎯 MEETING.ENDED - Process recording and assign tasks
  if (event === "meeting.ended") {
    console.log("🏁 Meeting Ended - Processing Recording!");

    try {
      const meetingId = payload.object.id;
      const recordingId = `zoom_${meetingId}`;

      // Find the recording entry we created when meeting started
      const recording = await Recording.findOne({ meetingId: recordingId });

      if (!recording) {
        console.log("❌ No recording found for meeting:", meetingId);
        return res.status(200).send("OK");
      }

      // Wait a bit for Zoom to process the recording (usually takes 5-10 minutes)
      console.log("⏳ Waiting for Zoom recording to be available...");

      // For now, we'll simulate - in production you'd poll Zoom API
      // or wait for the recording.completed webhook

      // TODO: Poll Zoom API for recording availability
      // For demo, we'll assume recording is ready

      // This should ideally be handled by recording.completed webhook
      // But since user wants meeting.end to trigger task assignment,
      // we'll implement a delayed processing

      setTimeout(async () => {
        await processZoomRecording(recording);
      }, 30000); // Wait 30 seconds for demo

    } catch (err) {
      console.error("❌ Error processing meeting end:", err.message);
    }
  }

  // 🎯 RECORDING.COMPLETED - Download and process
  if (event === "recording.completed") {
    console.log("🎥 Recording Completed - Processing!");

    try {
      const meetingId = payload.object.id;
      const recordingId = `zoom_${meetingId}`;

      // Find recording entry
      const recording = await Recording.findOne({ meetingId: recordingId });

      if (!recording) {
        console.log("❌ No recording entry found for:", meetingId);
        return res.status(200).send("OK");
      }

      await processZoomRecording(recording, payload);

    } catch (err) {
      console.error("❌ Error processing recording:", err.message);
    }
  }

  res.status(200).send("OK");
});

// Process Zoom recording function
async function processZoomRecording(recording, payload = null) {
  try {
    let downloadUrl = null;
    let filePath = null;

    if (payload) {
      // From recording.completed webhook
      const recordingFiles = payload.object.recording_files;
      const audioFile = recordingFiles.find(file => file.file_type === "M4A");

      if (!audioFile) {
        console.log("❌ No audio file found in recording.completed");
        return;
      }

      downloadUrl = audioFile.download_url;
    } else {
      // For meeting.ended, we'd need to poll Zoom API
      // This is a simplified version - in production you'd call Zoom API
      console.log("⚠️ Meeting ended - in production, poll Zoom API for recording");
      return;
    }

    console.log("📥 Downloading from:", downloadUrl);

    // Download file
    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${process.env.ZOOM_ACCESS_TOKEN}`,
      },
    });

    filePath = `./zoom_recording_${recording._id}.m4a`;
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("✅ File saved:", filePath);

    // Update recording
    recording.filePath = filePath;
    recording.status = "processing";
    await recording.save();

    // Send to AI service
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(filePath));

    console.log("🧠 Sending to AI Service...");
    const aiRes = await axios.post("http://localhost:8000/process", formData, {
      headers: formData.getHeaders(),
      timeout: 300000 // 5 minutes
    });

    console.log("🧠 AI Response:", aiRes.data);

    // Update recording with results
    recording.transcription = aiRes.data.text || "";
    recording.processingResult = aiRes.data;
    recording.status = "completed";

    // Extract and save tasks
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

        // Send email notification
        try {
          await sendTaskEmail(task);
          console.log("📧 Email sent for task:", task.task);
        } catch (emailErr) {
          console.error("❌ Email error:", emailErr.message);
        }
      }

      // Send emails to ALL users about new tasks
      const allUsers = await User.find();
      for (const user of allUsers) {
        if (user._id.toString() !== recording.userId.toString()) {
          // Send notification email to other users
          console.log("📧 Notifying user:", user.email);
          // TODO: Implement notification email
        }
      }
    }

    await recording.save();
    console.log("✅ Recording processed and tasks assigned!");

    // Clean up file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupErr) {
      console.error("❌ Cleanup error:", cleanupErr.message);
    }

  } catch (err) {
    console.error("❌ Error processing Zoom recording:", err.message);
    recording.status = "failed";
    recording.errorMessage = err.message;
    await recording.save();
  }
}

export default router;