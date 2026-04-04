import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MeetingRoom from "./pages/MeetingRoom";
import AdminTaskDashboardWithSocket from "./pages/AdminTaskDashboardWithSocket";
import EmployeeTaskDashboardWithSocket from "./pages/EmployeeTaskDashboardWithSocket";

// Protected Route Component
function ProtectedRoute({ element, allowedRoles }) {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/login" replace />;
  }

  return element;
}

function App() {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Main dashboard routes - role-based routing */}
        <Route 
          path="/" 
          element={token ? (
            user?.role === "admin" ? 
              <AdminTaskDashboardWithSocket /> : 
              <EmployeeTaskDashboardWithSocket />
          ) : <Navigate to="/login" replace />}
        />
        <Route 
          path="/dashboard" 
          element={token ? (
            user?.role === "admin" ? 
              <AdminTaskDashboardWithSocket /> : 
              <EmployeeTaskDashboardWithSocket />
          ) : <Navigate to="/login" replace />}
        />
        
        {/* Legacy dashboard (optional) */}
        <Route 
          path="/legacy-dashboard" 
          element={<ProtectedRoute element={<Dashboard />} />}
        />
        
        {/* Meeting room */}
        <Route 
          path="/meeting/:meetingId" 
          element={<ProtectedRoute element={<MeetingRoom />} />}
        />
        <Route 
          path="/meeting" 
          element={<ProtectedRoute element={<MeetingRoom />} />}
        />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
