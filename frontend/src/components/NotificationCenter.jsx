import React from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

export default function NotificationCenter({ notifications, onDismiss }) {
    const getNotificationStyles = (type) => {
        switch (type) {
            case "success":
                return "bg-green-50 border-green-500 text-green-800";
            case "warning":
                return "bg-yellow-50 border-yellow-500 text-yellow-800";
            case "alert":
                return "bg-red-50 border-red-500 text-red-800";
            case "info":
            default:
                return "bg-blue-50 border-blue-500 text-blue-800";
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case "success":
                return <CheckCircle size={20} />;
            case "warning":
            case "alert":
                return <AlertTriangle size={20} />;
            case "info":
            default:
                return <Info size={20} />;
        }
    };

    return (
        <div className="fixed top-4 right-4 z-50 max-w-md space-y-2 max-h-96 overflow-y-auto">
            {notifications.map(notification => (
                <div
                    key={notification.id}
                    className={`border-l-4 rounded-r-lg shadow-lg p-4 flex items-start gap-3 animate-slideIn ${getNotificationStyles(
                        notification.type
                    )}`}
                >
                    <div className="flex-shrink-0 mt-0.5">{getIcon(notification.type)}</div>
                    <div className="flex-1">
                        <p className="font-semibold">{notification.message}</p>
                        <p className="text-xs opacity-75 mt-1">
                            {new Date(notification.timestamp).toLocaleTimeString()}
                        </p>
                    </div>
                    <button
                        onClick={() => onDismiss(notification.id)}
                        className="flex-shrink-0 hover:opacity-75 transition"
                    >
                        <X size={18} />
                    </button>
                </div>
            ))}
        </div>
    );
}
