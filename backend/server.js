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
import User from "./models/User.js";
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

// Use configured multer upload instance
app.post("/upload", requireAuth, upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const meetingId = req.body.meetingId;
        console.log(`[Upload] Received meetingId: ${meetingId}`);
        const filePath = req.file.path;
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        // Fetch user list and pass it to AI Service for fuzzy matching
        try {
            const employees = await User.find({ role: "employee" }).select("name").lean();
            const userList = employees.map(emp => emp.name);
            formData.append("users", JSON.stringify(userList));
        } catch (err) {
            console.error("Failed to fetch user list for AI processor:", err);
            formData.append("users", JSON.stringify([]));
        }

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
            const personName = t.assignedTo || t.person || "Unassigned";
            
            let employee = null;
            if (personName !== "Unassigned") {
               employee = await User.findOne({ 
                   name: new RegExp(`^${personName}$`, 'i'), 
                   role: "employee" 
               });
            }

            const taskData = {
                taskName: t.task,
                assignedToName: personName,
                deadline: t.deadline || "Not specified",
                priority: t.priority || "Low",
                assignedBy: req.user.id,
                ...(meetingId && { meetingId: meetingId })
            };

            if (employee) {
                taskData.assignedTo = employee._id;
                taskData.empId = employee.employeeId;
                taskData.assignedToEmail = employee.email;
                taskData.assignmentStatus = "assigned";
            } else {
                taskData.assignmentStatus = "unassigned";
                taskData.inconsistencies = [{
                    type: "empid_mismatch",
                    description: `AI assigned task to "${personName}" but user is not registered in Database.`,
                    severity: "critical",
                    flaggedAt: new Date(),
                    flaggedBy: req.user.id
                }];
            }

            const newTask = await Task.create(taskData);
            
            if (employee) {
                newTask.isNewAssignment = true;
            }

            // Sends formatted HTML if employee found, else acts correctly as fallback logger "No email found..."
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






connectDB();
server.listen(5000, () => {
    console.log("Backend running on port 5000 with Socket.IO 🚀");
});
