# AI Meeting App

An intelligent AI-powered meeting assistant that transcribes audio, identifies speakers, extracts action items, and manages tasks with deadline reminders.

## 📋 Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [How It Works](#how-it-works)

---

## Overview

**AI Meeting App** is a comprehensive meeting management system that leverages artificial intelligence to:
- Convert speech to text with speaker identification
- Automatically extract action items and tasks from meeting transcripts
- Manage tasks with priority levels and deadlines
- Send email reminders for approaching deadlines
- Provide a user-friendly dashboard for task tracking
- Enable real-time collaboration through WebSocket connections

This application is designed for teams that want to automate meeting follow-ups and ensure no action items are forgotten.

---

## Tech Stack

### 🎨 Frontend
- **React 19** - UI framework
- **Vite** - Build tool and development server
- **React Router DOM** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Socket.io Client** - Real-time communication
- **jsPDF & jsPDF AutoTable** - PDF generation for reports
- **Axios** - HTTP client

### 🔧 Backend
- **Node.js + Express** - REST API server
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - Authentication & authorization
- **Socket.io** - WebSocket for real-time updates
- **Multer** - File upload handling
- **Nodemailer** - Email service
- **bcryptjs** - Password hashing
- **node-cron** - Task scheduling
- **UUID** - Unique ID generation

### 🧠 AI Service
- **FastAPI** - Python web framework
- **OpenAI Whisper** - Speech-to-text transcription
- **Google Generative AI (Gemini 2.5 Flash)** - Task extraction from text
- **Pyannote Audio** - Speaker diarization (speaker identification)
- **Python-dotenv** - Environment configuration

---

## Key Features

✨ **Core Functionality**
- 🎙️ **Audio Transcription** - Convert meeting recordings to text with speaker labels
- 🤖 **AI Task Extraction** - Automatically identify action items using Gemini AI
- 👥 **Speaker Identification** - Determine who said what using speaker diarization
- 📋 **Task Management** - Create, organize, and track tasks with priorities
- ⏰ **Automatic Reminders** - Email notifications 1 hour and 24 hours before deadline
- 🔐 **User Authentication** - Secure login and registration
- 👤 **User Profiles** - Manage user information
- 📊 **Dashboard** - Centralized task overview and management
- 🔄 **Real-time Updates** - Live synchronization across connected clients
- 📄 **PDF Reporting** - Export tasks and summaries as PDF

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Frontend (React)                 │
│              Dashboard • Task Management             │
│           Real-time Updates • PDF Export            │
└──────────────────────┬──────────────────────────────┘
                       │
                    HTTP + WebSocket
                       │
┌──────────────────────┴──────────────────────────────┐
│              Backend (Express + MongoDB)            │
│    REST APIs • Authentication • Email Service      │
│         Task Management • Real-time Events          │
└──────────────────────┬──────────────────────────────┘
                       │
                   HTTP/Multipart
                       │
┌──────────────────────┴──────────────────────────────┐
│         AI Service (FastAPI + Python)              │
│  Speech Recognition • Speaker Diarization           │
│        AI Task Extraction (Gemini API)             │
└─────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User uploads meeting audio → Backend receives file
2. Backend forwards to AI Service
3. AI Service:
   - Transcribes audio using Whisper
   - Identifies speakers using Pyannote
   - Extracts tasks using Gemini AI
4. AI Service returns results to Backend
5. Backend stores tasks in MongoDB
6. Frontend displays tasks and enables management
7. Cron jobs send email reminders at specified times

---

## Project Structure

```
ai-meeting-app/
├── frontend/                  # React Vite application
│   ├── src/
│   │   ├── pages/            # Page components (Login, Register, Dashboard, MeetingRoom)
│   │   ├── assets/           # Static assets & CSS
│   │   ├── App.jsx           # Main app component with routing
│   │   └── main.jsx          # Entry point
│   ├── package.json          # Frontend dependencies
│   ├── vite.config.js        # Vite configuration
│   ├── eslint.config.js      # ESLint rules
│   └── index.html            # HTML template
│
├── backend/                   # Express.js application
│   ├── config/               # Database & configuration files
│   │   └── db.js             # MongoDB connection
│   ├── models/               # Mongoose schemas
│   │   ├── User.js           # User model
│   │   └── Task.js           # Task model
│   ├── routes/               # API routes
│   │   └── auth.js           # Authentication endpoints
│   ├── middleware/           # Custom middleware
│   │   └── auth.js           # JWT verification
│   ├── services/             # Business logic
│   │   ├── mailer.js         # Email service
│   │   └── cron.js           # Scheduled tasks
│   ├── uploads/              # Uploaded audio files storage
│   ├── server.js             # Main server file
│   └── package.json          # Backend dependencies
│
├── ai-service/               # FastAPI Python service
│   ├── main.py               # API endpoints & orchestration
│   ├── services/
│   │   ├── gemini_service.py # Gemini API integration
│   │   └── nlp.py            # NLP task extraction logic
│   └── requirements.txt      # Python dependencies
│
└── README.md                 # This file
```

---

## Installation

### Prerequisites
- **Node.js** (v16 or higher)
- **Python** (v3.8 or higher)
- **MongoDB** (local or cloud Atlas)
- **Git**

### Step 1: Clone the Repository
```bash
cd /path/to/project
git clone <repository-url>
cd ai-meeting-app
```

### Step 2: Setup Frontend
```bash
cd frontend
npm install
```

### Step 3: Setup Backend
```bash
cd ../backend
npm install
```

### Step 4: Setup AI Service
```bash
cd ../ai-service
pip install -r requirements.txt
```

If `requirements.txt` doesn't exist, install these packages:
```bash
pip install fastapi python-multipart uvicorn openai-whisper python-dotenv google-generativeai pyannote.audio huggingface_hub
```

---

## Configuration

### Backend Environment Variables
Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000

# Database
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRY=7d

# Email Service (Gmail SMTP recommended)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@aimeeting.app

# AI Service
AI_SERVICE_URL=http://localhost:8000
```

### Frontend Environment Variables
Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### AI Service Environment Variables
Create a `.env` file in the `ai-service/` directory:

```env
# Google Gemini API
GOOGLE_API_KEY=your_google_api_key

# Hugging Face Token (for Speaker Diarization)
HF_TOKEN=your_huggingface_token

# Server
PORT=8000
```

---

## Running the Application

### Option 1: Run All Services Separately (Development)

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Server will run on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Frontend will run on http://localhost:5173
```

**Terminal 3 - AI Service:**
```bash
cd ai-service
uvicorn main:app --reload --port 8000
# AI Service will run on http://localhost:8000
```

### Option 2: Run with Docker (Optional)
If Docker is configured:
```bash
docker-compose up
```

### Option 3: Production Build

**Build Frontend:**
```bash
cd frontend
npm run build
# Outputs to frontend/dist/
```

**Run Backend in Production:**
```bash
cd backend
npm start
# Set NODE_ENV=production in .env
```

**Run AI Service in Production:**
```bash
cd ai-service
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## How It Works

### 1. User Registration & Authentication
- User creates account with email and password
- Password is hashed using bcryptjs
- JWT token issued upon login
- Token required for all protected API endpoints

### 2. Meeting Recording Upload
- User navigates to MeetingRoom page
- Uploads an audio file (MP3, WAV, etc.)
- Frontend sends file to Backend

### 3. Audio Processing Pipeline
```
Audio File (Backend)
        ↓
Upload to AI Service
        ↓
Whisper Transcription
        ↓
Speaker Diarization (Pyannote)
        ↓
Combine: "Speaker_X: Transcript"
        ↓
Gemini AI Task Extraction
        ↓
JSON Response: { tasks: [...], summary: "..." }
        ↓
Store in MongoDB
        ↓
WebSocket Notification to Frontend
```

### 4. Task Extraction Details
The Gemini AI model analyzes the transcript and extracts:
- **Task Description** - What needs to be done
- **Assigned Person** - Who is responsible
- **Deadline** - When it should be completed
- **Priority** - High/Medium/Low
- **Person Recognition** - Identifies proper names in transcripts

### 5. Task Management
- Tasks displayed in Dashboard with real-time updates
- Users can:
  - Mark tasks as complete
  - Update priority and deadline
  - Reassign tasks to other users
  - Delete tasks
  - Export tasks as PDF reports

### 6. Automated Email Reminders
- **Cron Job** runs every minute to check deadlines
- Sends email reminder **1 hour** before deadline
- Sends email reminder **24 hours** before deadline
- Uses Nodemailer via Gmail SMTP

### 7. Real-time Collaboration
- WebSocket (Socket.io) enables live updates
- When one user creates/updates a task, all connected clients receive notification
- Real-time task status synchronization

---

## API Endpoints (Main)

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Tasks
- `POST /api/tasks/upload` - Upload audio and extract tasks
- `GET /api/tasks` - Get all tasks for user
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile

---

## Troubleshooting

### Issue: "Cannot connect to MongoDB"
**Solution:** Verify MongoDB URI in `.env`, ensure network access is allowed in MongoDB Atlas (if using cloud)

### Issue: "AI Service not responding"
**Solution:** Check if Python service is running on port 8000, verify all Python dependencies are installed

### Issue: "Email not sending"
**Solution:** Enable "Less secure apps" in Gmail settings, or use an app-specific password

### Issue: "Speaker diarization not working"
**Solution:** Ensure HF_TOKEN is set correctly, audio file quality is sufficient (min 5-10 seconds per speaker)

---

## Development Tips

- Use `npm run lint` in frontend to check code quality
- Backend logs are printed to console with timestamps
- Check browser DevTools Network tab to debug API calls
- Use MongoDB Compass to inspect database collections
- Test email functionality with `test_email` endpoint

---

## Future Enhancements

- 🔄 Multi-language support
- 🎯 Calendar integration for deadline management
- 📊 Analytics dashboard for meeting insights
- 🔔 Multiple notification channels (SMS, Slack, Teams)
- 🎨 Custom task templates
- 👥 Team collaboration features
- 📱 Mobile app

---

## License

ISC

---

## Support

For issues, questions, or suggestions, please create an issue in the repository or contact the development team.

---

**Last Updated:** April 2, 2026  
**Version:** 1.0.0
