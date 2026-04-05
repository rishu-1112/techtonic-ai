import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { LogOut, Edit2, Trash2, CheckCircle, Clock, AlertCircle, FileText, Mic, Square, Download, Phone } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Dashboard() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [tasks, setTasks] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ task: "", deadline: "", priority: "" });
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    if (!token) {
      navigate("/login");
    } else {
      fetchTasks();
    }
  }, [navigate, token]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const api = axios.create({
    baseURL: "http://localhost:5000",
    headers: { Authorization: `Bearer ${token}` }
  });

  const fetchTasks = async () => {
    try {
      const res = await api.get("/api/tasks");
      setTasks(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "recording.webm", { type: 'audio/webm' });
        setFile(audioFile);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied or error occurred: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Select file first!");
    const formData = new FormData();
    formData.append("audio", file);

    try {
      const res = await api.post("/upload", formData);
      setText(res.data.text);
      setSummary(res.data.summary || "");
      fetchTasks();
    } catch (err) {
      alert("Error uploading file");
    }
  };

  const markDone = async (id, currentStatus) => {
    try {
      await api.put(`/api/tasks/${id}`, {
        status: currentStatus === "completed" ? "pending" : "completed",
      });
      fetchTasks();
    } catch (err) {
      alert("Error updating status");
    }
  };

  const deleteTask = async (id) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await api.delete(`/api/tasks/${id}`);
      fetchTasks();
    } catch (err) {
      alert("Error deleting task");
    }
  };

  const startEditing = (t) => {
    setEditingId(t._id);
    setEditForm({ task: t.taskName || t.task, deadline: t.deadline, priority: t.priority });
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/api/tasks/edit/${id}`, editForm);
      setEditingId(null);
      fetchTasks();
    } catch (err) {
      alert("Error saving task");
    }
  };

  // Stats calculation
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const pendingTasks = tasks.filter(t => t.status === "pending").length;
  const highPriorityTasks = tasks.filter(t => t.priority === "High").length;

  const isToday = (dateString) => {
    if (!dateString) return false;
    const today = new Date();
    const target = new Date(dateString);
    if (!isNaN(target.getTime())) {
      return (
        target.getDate() === today.getDate() &&
        target.getMonth() === today.getMonth() &&
        target.getFullYear() === today.getFullYear()
      );
    }
    // Simple naive check for natural language strings
    return dateString.toLowerCase().includes("today");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("Meeting Tasks Summary", 14, 15);
    
    let yOffset = 25;
    
    if (summary) {
      doc.setFontSize(11);
      doc.text("Meeting Summary:", 14, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      const splitSummary = doc.splitTextToSize(summary, 180);
      doc.text(splitSummary, 14, yOffset);
      yOffset += (splitSummary.length * 5) + 5;
    }
    
    const tableColumn = ["Task", "Person", "Deadline", "Priority", "Status"];
    const tableRows = [];

    tasks.forEach(task => {
      const taskData = [
        task.taskName || task.task,
        task.assignedToName || task.person || "Unassigned",
        task.deadline || "-",
        task.priority || "-",
        task.status
      ];
      tableRows.push(taskData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: yOffset,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      alternateRowStyles: { fillColor: [243, 244, 246] }
    });

    doc.save("tasks_summary.pdf");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 text-white font-sans">

      {/* NAVBAR */}
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8 bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-lg">
        <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          Techtonic AI
        </h1>
        <div className="flex items-center gap-4">
          {/* <button 
            onClick={() => navigate("/meeting")}
            className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 rounded-lg text-white font-semibold hover:from-green-600 hover:to-emerald-700 transition-colors shadow-lg"
          >
            <Phone size={18} /> Start Meeting
          </button> */}
          <span className="text-sm text-gray-300">Welcome, <span className="font-semibold text-white">{user?.name}</span></span>
          <button onClick={handleLogout} className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </nav>

      {/* DASHBOARD STATS */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
          <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><FileText size={24} /></div>
          <div><p className="text-sm text-gray-400">Total Tasks</p><h3 className="text-2xl font-bold">{totalTasks}</h3></div>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
          <div className="p-3 bg-green-500/20 rounded-xl text-green-400"><CheckCircle size={24} /></div>
          <div><p className="text-sm text-gray-400">Completed</p><h3 className="text-2xl font-bold">{completedTasks}</h3></div>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
          <div className="p-3 bg-yellow-500/20 rounded-xl text-yellow-400"><Clock size={24} /></div>
          <div><p className="text-sm text-gray-400">Pending</p><h3 className="text-2xl font-bold">{pendingTasks}</h3></div>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-lg flex items-center gap-4 hover:scale-105 transition-transform">
          <div className="p-3 bg-red-500/20 rounded-xl text-red-400"><AlertCircle size={24} /></div>
          <div><p className="text-sm text-gray-400">High Priority</p><h3 className="text-2xl font-bold">{highPriorityTasks}</h3></div>
        </div>
      </div>

      {summary && (
        <div className="bg-white shadow-md rounded-2xl p-6 max-w-3xl mx-auto mb-6 text-gray-900 border border-white/20">
          <h2 className="text-xl font-semibold mb-2">🧠 Meeting Summary</h2>
          <p className="text-gray-700">{summary}</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN: UPLOAD & TRANSCRIPT */}
        <div className="space-y-8">
          <div className="bg-white/10 backdrop-blur-md shadow-2xl rounded-2xl p-6 border border-white/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-100">Upload or Record Audio</h2>
            
            <div className="flex flex-col gap-4 mb-4">
              <input
                type="file"
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 cursor-pointer"
                onChange={(e) => setFile(e.target.files[0])}
              />
              
              {!isRecording ? (
                <button onClick={startRecording} className="w-full bg-red-500/20 text-red-300 font-semibold px-4 py-2 rounded-xl hover:bg-red-500/30 transition-all flex justify-center items-center gap-2 border border-red-500/30">
                  <Mic size={18} /> Start Recording/Meeting
                </button>
              ) : (
                <button onClick={stopRecording} className="w-full bg-red-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 flex justify-center items-center gap-2 animate-pulse">
                  <Square size={18} /> Stop Recording ({recordingTime}s)
                </button>
              )}
            </div>

            {file && <p className="text-sm text-green-400 mb-4 truncate text-center bg-green-500/10 py-1.5 rounded-lg border border-green-500/20">Selected: {file.name}</p>}
            <button
              onClick={handleUpload}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 font-semibold text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg"
            >
              Upload & Generate
            </button>
          </div>

          {text && (
            <div className="bg-white/10 backdrop-blur-md shadow-xl rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold mb-3 text-gray-100">Transcription</h2>
              <div className="max-h-64 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20">
                <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: TASKS */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">Your Tasks</h2>
            <button 
              onClick={exportToPDF}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 rounded-xl text-white font-semibold hover:from-blue-600 hover:to-indigo-700 transition shadow-lg text-sm"
            >
              <Download size={16} /> Export PDF
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/10 border-dashed">
              <p className="text-gray-400">No tasks generated yet. Upload an audio to get started.</p>
            </div>
          ) : (
            tasks.map((t) => {
              const dueToday = isToday(t.deadline);

              return (
                <div
                  key={t._id}
                  className={`relative bg-white/10 backdrop-blur-md shadow-lg rounded-2xl p-5 border transition-all ${dueToday && t.status !== "completed" ? 'border-red-500/50 shadow-red-500/10' : 'border-white/10'}`}
                >
                  {/* Status Indicator Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${t.status === "completed" ? "bg-green-500" : dueToday ? "bg-red-500" : "bg-blue-500"}`}></div>

                  {editingId === t._id ? (
                    <div className="space-y-3 pl-2">
                      <input
                        className="w-full bg-black/30 border border-white/20 rounded-lg p-2 text-white"
                        value={editForm.task}
                        onChange={e => setEditForm({ ...editForm, task: e.target.value })}
                      />
                      <div className="flex gap-3">
                        <input
                          className="flex-1 bg-black/30 border border-white/20 rounded-lg p-2 text-white text-sm"
                          value={editForm.deadline}
                          onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                          placeholder="Deadline"
                        />
                        <select
                          className="flex-1 bg-black/30 border border-white/20 rounded-lg p-2 text-white text-sm"
                          value={editForm.priority}
                          onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => saveEdit(t._id)} className="bg-blue-600 px-4 py-1.5 rounded-lg text-sm hover:bg-blue-500">Save</button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-600 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-500">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-2">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className={`font-semibold text-lg ${t.status === "completed" ? "text-gray-400 line-through" : "text-white"}`}>
                          {t.taskName || t.task}
                        </h3>
                        <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditing(t)} className="p-1 hover:text-blue-400 transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => deleteTask(t._id)} className="p-1 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-400 mb-4 mt-1">
                        <span className="flex items-center gap-1">👤 {t.assignedToName || t.person || "Unassigned"}</span>
                        <span className={`flex items-center gap-1 ${dueToday && t.status !== "done" ? "text-red-400 font-medium" : ""}`}>
                          📅 {t.deadline || "No deadline"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium bg-opacity-20 border
                             ${t.priority === "High" ? "bg-red-500 border-red-500/30 text-red-300" :
                              t.priority === "Medium" ? "bg-yellow-500 border-yellow-500/30 text-yellow-300" :
                                "bg-green-500 border-green-500/30 text-green-300"}`}
                          >
                            {t.priority}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium bg-opacity-20 border
                            ${t.status === "completed" ? "bg-green-500 border-green-500/30 text-green-300" : "bg-gray-500 border-gray-500/30 text-gray-300"}`}
                          >
                            {t.status}
                          </span>
                        </div>

                        <button
                          onClick={() => markDone(t._id, t.status)}
                          className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all ${t.status === "completed"
                              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                              : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg"
                            }`}
                        >
                          <CheckCircle size={14} /> {t.status === "completed" ? "Undo" : "Complete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
