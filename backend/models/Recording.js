import mongoose from "mongoose";

const recordingSchema = new mongoose.Schema({
    meetingId: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    filePath: String,
    transcription: String,
    extractedTasks: [{
        task: String,
        person: String,
        deadline: String,
        priority: String,
        status: {
            type: String,
            default: "pending"
        }
    }],
    duration: Number, // in seconds
    status: {
        type: String,
        enum: ["recording", "processing", "completed", "failed"],
        default: "recording"
    },
    processingResult: mongoose.Schema.Types.Mixed,
    errorMessage: String
}, { timestamps: true });

export default mongoose.model("Recording", recordingSchema);
