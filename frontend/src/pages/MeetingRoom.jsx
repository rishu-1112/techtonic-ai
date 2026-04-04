import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { Mic, Square, LogOut, Check, X, CheckCircle, Clock, AlertCircle, FileText, Phone, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { io } from "socket.io-client";

export default function MeetingRoom() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  
  // States
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingId, setRecordingId] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null); // null, "processing", "completed", "error"
  const [transcription, setTranscription] = useState("");
  const [extractedTasks, setExtractedTasks] = useState([]);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [zoomAutoStart, setZoomAutoStart] = useState(false);

  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  const api = axios.create({
    baseURL: "http://localhost:5000",
    headers: { Authorization: `Bearer ${token}` }
  });

  // Timer for recording
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Setup socket connection
  useEffect(() => {
    const socketConnection = io("http://localhost:5000");
    setSocket(socketConnection);

    socketConnection.on("zoom-meeting-auto-start", (data) => {
      console.log("🔥 Zoom meeting auto-start triggered:", data);
      setZoomAutoStart(true);
      setError(null);
      
      // Auto start meeting
      startMeeting();
    });

    socketConnection.on("connect", () => {
      console.log("🔌 Connected to server");
    });

    socketConnection.on("disconnect", () => {
      console.log("🔌 Disconnected from server");
    });

    return () => {
      socketConnection.disconnect();
    };
  }, []);



  // Format time display
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start meeting and recording
  const startMeeting = async () => {
    try {
      setError(null);
      setMeetingStarted(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `meeting_${Date.now()}.webm`, { type: 'audio/webm' });
        uploadRecording(audioFile);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);

      // Start tracking in backend
      try {
        const res = await api.post("/api/recordings/start", { 
          meetingId: meetingId || `meeting_${Date.now()}`
        });
        setRecordingId(res.data._id);
        console.log("✅ Meeting and recording started");
      } catch (err) {
        console.error("Error starting recording in backend:", err.message);
      }
    } catch (err) {
      setError("Microphone access denied or error occurred: " + err.message);
      setMeetingStarted(false);
      console.error(err);
    }
  };

  // Stop meeting and upload recording
  const endMeeting = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      console.log("⏹️ Recording stopped, uploading...");
    }
  };

  // Upload recording to backend
  const uploadRecording = async (audioFile) => {
    try {
      setProcessingStatus("processing");
      setError(null);

      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("meetingId", meetingId || `meeting_${Date.now()}`);
      formData.append("duration", recordingTime.toString());

      const res = await api.post("/api/recordings/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setRecordingId(res.data.recordingId);
      console.log("📤 Recording uploaded, processing...");

      // Poll for processing completion
      pollRecordingStatus(res.data.recordingId);
    } catch (err) {
      setProcessingStatus("error");
      setError("Error uploading recording: " + err.message);
      console.error(err);
    }
  };

  // Poll recording status
  const pollRecordingStatus = async (recId) => {
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await api.get(`/api/recordings/${recId}`);
        
        if (res.data.status === "completed") {
          setTranscription(res.data.transcription);
          setExtractedTasks(res.data.extractedTasks || []);
          setProcessingStatus("completed");
        } else if (res.data.status === "failed") {
          setProcessingStatus("error");
          setError("Recording processing failed: " + (res.data.errorMessage || "Unknown error"));
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000); // Check every 5 seconds
        } else {
          setProcessingStatus("error");
          setError("Recording processing timeout");
        }
      } catch (err) {
        console.error("Error polling recording status:", err.message);
      }
    };

    poll();
  };

  // Statistics
  const totalTasks = extractedTasks.length;
  const highPriorityTasks = extractedTasks.filter(t => t.priority === "High").length;
  const completedTasks = extractedTasks.filter(t => t.status === "done").length;

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("Meeting Recording Summary", 14, 15);
    
    let yOffset = 25;
    
    if (transcription) {
      doc.setFontSize(11);
      doc.text("Transcription:", 14, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      const splitText = doc.splitTextToSize(transcription, 180);
      doc.text(splitText, 14, yOffset);
      yOffset += (splitText.length * 5) + 10;
    }
    
    if (extractedTasks.length > 0) {
      doc.setFontSize(11);
      doc.text("Extracted Tasks:", 14, yOffset);
      yOffset += 7;
      
      const tableColumn = ["Task", "Person", "Deadline", "Priority"];
      const tableRows = extractedTasks.map(t => [
        t.task,
        t.person || "Unassigned",
        t.deadline || "-",
        t.priority || "-"
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: yOffset,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [243, 244, 246] }
      });
    }

    doc.save(`meeting_${meetingId || Date.now()}_summary.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8 text-white font-sans">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <nav className="flex justify-between items-center bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-lg">
          <div>
            <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              🎥 Meeting Room
            </h1>
            <p className="text-sm text-gray-400 mt-1">Welcome, {user?.name}</p>
          </div>
          {!meetingStarted && processingStatus !== "processing" && processingStatus !== "completed" && (
            <button 
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 text-gray-300 hover:text-blue-400 transition-colors"
            >
              <LogOut size={18} /> Back to Dashboard
            </button>
          )}
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-6xl mx-auto mb-6 bg-red-500/20 border border-red-500/50 text-red-300 p-4 rounded-xl">
          <p className="font-semibold">⚠️ Error: {error}</p>
        </div>
      )}

      {!meetingStarted ? (
        // BEFORE MEETING STARTS
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-gray-700 via-gray-800 to-gray-900 border border-gray-600/50 rounded-2xl p-12 shadow-lg text-center">
            <div className="mb-8">
              <div className="text-6xl mb-6">🎥</div>
              <h2 className="text-4xl font-bold text-white mb-4">Ready to Start Meeting?</h2>
              <p className="text-gray-300 text-lg mb-6">Click the button below to start your meeting and begin recording.</p>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-blue-300 text-sm">
                <p>💡 Your audio will be recorded and analyzed to extract tasks with deadlines and priorities.</p>
              </div>
            </div>
            
            <button
              onClick={startMeeting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-8 rounded-2xl transition-all shadow-lg shadow-green-500/30 flex items-center justify-center gap-3 text-2xl hover:scale-105 transform"
            >
              <Phone size={32} /> Start Meeting
            </button>
          </div>
        </div>
      ) : meetingStarted && !processingStatus ? (
        // MEETING IN PROGRESS
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Meeting Status Card */}
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-2xl p-8 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">🔴 Meeting in Progress</h2>
                <p className="text-green-300 text-lg">Meeting ID: {meetingId || "New Meeting"}</p>
              </div>
              <div className="text-right">
                <div className="text-5xl font-mono font-bold text-green-400 mb-2">
                  {formatTime(recordingTime)}
                </div>
                <div className="flex items-center gap-2 text-green-300">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Recording Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Zoom Auto-Start Notification */}
          {zoomAutoStart && (
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 text-blue-300">
              <p className="font-semibold">🎬 Zoom Meeting Detected!</p>
              <p className="text-sm mt-1">Recording automatically started when your Zoom meeting began.</p>
            </div>
          )}

          {/* Recording Controls */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-lg text-center">
            <div className="mb-6">
              <Mic className="w-16 h-16 mx-auto text-blue-400 mb-4 animate-bounce" />
              <h3 className="text-xl font-semibold text-gray-100">Audio Recording Status</h3>
              <p className="text-gray-400 mt-2">Your meeting audio is being recorded and will be analyzed for tasks</p>
            </div>
            
            <div className="space-y-4">
              {isRecording && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6">
                  <p className="text-red-300 font-semibold">🎤 Recording in Progress...</p>
                </div>
              )}
              
              <button
                onClick={endMeeting}
                disabled={!isRecording}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2 text-lg hover:scale-105 transform"
              >
                <Square size={24} /> End Meeting & Upload
              </button>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-blue-300 text-sm">
            <p>💡 <strong>Tip:</strong> Make sure everyone in the meeting speaks clearly. The AI will extract tasks and assign them based on speaker names.</p>
          </div>
        </div>
      ) : (
        // POST-MEETING PROCESSING
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Processing Status */}
          {processingStatus && (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">
                    {processingStatus === "processing" && "🔄 Processing Recording..."}
                    {processingStatus === "completed" && "✅ Processing Complete!"}
                    {processingStatus === "error" && "❌ Processing Error"}
                  </h3>
                  <p className="text-gray-300">
                    {processingStatus === "processing" && "AI is analyzing your meeting audio. This may take a few minutes."}
                    {processingStatus === "completed" && "Your meeting has been transcribed and tasks extracted."}
                    {processingStatus === "error" && "Something went wrong during processing."}
                  </p>
                </div>
                {processingStatus === "processing" && <div className="animate-spin"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>}
              </div>
            </div>
          )}

          {processingStatus === "completed" && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
                  <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><FileText size={24} /></div>
                  <div><p className="text-sm text-gray-400">Total Tasks</p><h3 className="text-2xl font-bold">{totalTasks}</h3></div>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
                  <div className="p-3 bg-red-500/20 rounded-xl text-red-400"><AlertCircle size={24} /></div>
                  <div><p className="text-sm text-gray-400">High Priority</p><h3 className="text-2xl font-bold">{highPriorityTasks}</h3></div>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
                  <div className="p-3 bg-green-500/20 rounded-xl text-green-400"><CheckCircle size={24} /></div>
                  <div><p className="text-sm text-gray-400">Extracted Actions</p><h3 className="text-2xl font-bold">{extractedTasks.length}</h3></div>
                </div>
              </div>

              {transcription && (
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-lg">
                  <h3 className="text-xl font-bold mb-4">📝 Transcription</h3>
                  <div className="max-h-48 overflow-y-auto pr-4 bg-black/20 p-4 rounded-lg border border-white/5">
                    <p className="text-gray-300 leading-relaxed text-sm">{transcription}</p>
                  </div>
                </div>
              )}

              {/* Tasks List */}
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold">🎯 Extracted Tasks</h3>
                  {extractedTasks.length > 0 && (
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 rounded-xl text-white font-semibold hover:from-blue-600 hover:to-indigo-700 transition shadow-lg"
                    >
                      <Download size={18} /> Export PDF
                    </button>
                  )}
                </div>

                {extractedTasks.length === 0 ? (
                  <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10 border-dashed">
                    <p className="text-gray-400 mb-2">No tasks extracted from this meeting</p>
                    <p className="text-gray-500 text-sm">Try speaking more clearly about action items in your next meeting</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {extractedTasks.map((task, idx) => (
                      <div key={idx} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/10 shadow-lg hover:border-blue-500/50 transition-all">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/20 text-blue-400 font-bold">
                              {idx + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-white mb-2">{task.task}</h4>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
                              <span className="text-gray-400">👤 <span className="font-semibold text-white">{task.person || "Unassigned"}</span></span>
                              <span className="text-gray-400">📅 <span className="font-semibold text-white">{task.deadline || "No deadline"}</span></span>
                              <span className={`font-semibold ${
                                task.priority === "High" ? "text-red-400" :
                                task.priority === "Medium" ? "text-yellow-400" :
                                "text-green-400"
                              }`}>
                                🏷️ {task.priority || "Low"} Priority
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                task.status === "done" ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"
                              }`}>
                                {task.status === "done" ? "✅ Completed" : "⏳ Pending"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center py-6">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={() => {
                    setIsInMeeting(true);
                    setIsRecording(false);
                    setRecordingTime(0);
                    setProcessingStatus(null);
                    setTranscription("");
                    setExtractedTasks([]);
                    setError(null);
                    startMeetingRecording();
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-8 rounded-xl transition-all border border-white/20"
                >
                  Start New Meeting
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
