import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import Task from "./models/Task.js";
import Recording from "./models/Recording.js";
import { sendTaskEmail } from "./services/mailer.js";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import "./services/cron.js";
import zoomRoutes from "./routes/zoomWebhook.js";
import recordingRoutes from "./routes/recording.js";
import taskRoutes from "./routes/task.js";
import adminRoutes from "./routes/admin.js";
import { requireAuth } from "./middleware/auth.js";
import crypto from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeSocketHandlers } from "./services/socketService.js";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Store io instance in app.locals for access in routes
app.locals.io = io;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/admin", adminRoutes);
app.use("/webhook", zoomRoutes);

// Initialize Socket.IO handlers
initializeSocketHandlers(io);

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads folder if not exists
const uploadPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

const upload = multer({ dest: uploadPath });

// Socket.IO Connection
io.on("connection", (socket) => {
    console.log("New client connected", socket.id);

    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    socket.on("join-meeting", (meetingId) => {
        socket.join(`meeting_${meetingId}`);
        console.log(`Socket ${socket.id} joined meeting ${meetingId}`);
    });

    socket.on("zoom-meeting-started", (data) => {
        // Notify all clients that a Zoom meeting started
        io.emit("zoom-meeting-auto-start", {
            meetingId: data.meetingId,
            message: "Zoom meeting detected - auto starting recording"
        });
        console.log("🔥 Notifying clients: Zoom meeting started", data.meetingId);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected", socket.id);
    });
});

// Export io for use in other modules
export { io };

// API Routes
app.post("/api/meetings", async (req, res) => {
    try {
        const { roomId, title } = req.body;
        const meeting = await Meeting.create({ roomId, title });
        res.json(meeting);
    } catch (error) {
        res.status(500).json({ error: "Failed to create meeting" });
    }
});

app.get("/api/meetings/:roomId", async (req, res) => {
    try {
        const meeting = await Meeting.findOne({ roomId: req.params.roomId });
        res.json(meeting);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch meeting" });
    }
});

app.post("/upload", requireAuth, upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const meetingId = req.body.meetingId;
        const filePath = req.file.path;
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        console.log("[Upload] Calling AI service at http://127.0.0.1:8000/process");
        const response = await axios.post(
            "http://127.0.0.1:8000/process",
            formData,
            { headers: { ...formData.getHeaders() } }
        );

        fs.unlinkSync(filePath);

        const aiData = response.data;
        const savedTasks = [];

        console.log("[Upload] Processing tasks:", aiData.tasks.length);
        for (const t of aiData.tasks) {
            const newTask = await Task.create({
                task: t.task,
                person: t.person,
                deadline: t.deadline,
                priority: t.priority,
                owner: req.user.id,
                ...(meetingId && { meetingId: meetingId })
            });

            await sendTaskEmail(newTask);
            savedTasks.push(newTask);
        }

        // Save recording with transcription
        if (meetingId) {
            const recording = await Recording.findOneAndUpdate(
                { meetingId: meetingId, userId: req.user.id },
                {
                    transcription: aiData.text,
                    processingResult: {
                        summary: aiData.summary,
                        tasks: aiData.tasks
                    },
                    status: "completed"
                },
                { new: true, upsert: true }
            );

            io.to(meetingId).emit("meeting-updated", { text: aiData.text, summary: aiData.summary });
            io.to(meetingId).emit("tasks-added", savedTasks);
        }

        console.log("[Upload] Successfully processed:", { tasks: savedTasks.length });
        res.json({
            text: aiData.text,
            summary: aiData.summary,
            tasks: savedTasks
        });

    } catch (error) {
        console.error("[Upload] Error:", error.message, error.response?.data);
        const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message || "Error processing file";
        res.status(500).json({ error: errorMsg });
    }
});





app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
        const tasks = await Task.find({ owner: new mongoose.Types.ObjectId(req.user.id) }).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task || task.owner.toString() !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        const updated = await Task.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task" });
    }
});

app.put("/api/tasks/edit/:id", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task || task.owner.toString() !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        const { task: taskText, deadline, priority } = req.body;
        const updated = await Task.findByIdAndUpdate(
            req.params.id,
            { task: taskText, deadline, priority },
            { new: true }
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task details" });
    }
});

app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task || task.owner.toString() !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        await Task.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task" });
    }
});

connectDB();
server.listen(5000, () => {
    console.log("Backend running on port 5000 with Socket.IO 🚀");
});
