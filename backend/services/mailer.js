import nodemailer from "nodemailer";
import users from "../config/user.js";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.ADMIN_MAIL,
        pass: process.env.APP_PASS
    }
});

export const sendTaskEmail = async (task) => {
    try {
        // Support for new task assignment format
        if (task.assignedToEmail && task.isNewAssignment) {
            const mailOptions = {
                from: process.env.ADMIN_MAIL,
                to: task.assignedToEmail,
                subject: `New Task Assigned: ${task.taskName} 📋`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0;">📋 New Task Assigned</h2>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e9ecef;">
                            <p style="margin-top: 0;">Hi <strong>${task.assignedToName}</strong>,</p>
                            
                            <p>Admin <strong>${task.assignedByName}</strong> has assigned you a new task:</p>
                            
                            <div style="background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0;">
                                <p style="margin: 8px 0;"><strong>Task Name:</strong> ${task.taskName}</p>
                                <p style="margin: 8px 0;"><strong>Employee ID:</strong> ${task.empId}</p>
                                <p style="margin: 8px 0;"><strong>Deadline:</strong> ${new Date(task.deadline).toLocaleDateString()}</p>
                                <p style="margin: 8px 0;"><strong>Priority:</strong> <span style="color: ${
                                    task.priority === "High" ? "#dc3545" : 
                                    task.priority === "Medium" ? "#ff9800" : 
                                    "#28a745"
                                }; font-weight: bold;">${task.priority}</span></p>
                                ${task.description ? `<p style="margin: 8px 0;"><strong>Description:</strong> ${task.description}</p>` : ''}
                            </div>
                            
                            <p style="color: #666; font-size: 14px;">
                                Please log in to your dashboard to view more details and update the task status.
                            </p>
                            
                            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                                <p style="margin: 0; color: #999; font-size: 12px;">
                                    This is an automated email from Techtonic AI Task Management System.<br>
                                    Please do not reply to this email.
                                </p>
                            </div>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${task.assignedToEmail} for task: ${task.taskName}`);
            return;
        }

        // Legacy format support (from video transcription)
        const receiverEmail = users[task.person];

        // ❌ If no email found → skip
        if (!receiverEmail) {
            console.log("No email found for:", task.person);
            return;
        }

        const mailOptions = {
            from: process.env.ADMIN_MAIL,
            to: receiverEmail,
            subject: "Task Reminder 🚨",
            html: `
                <h3>New Task Assigned</h3>
                <p><b>Task:</b> ${task.task}</p>
                <p><b>Deadline:</b> ${task.deadline}</p>
                <p><b>Priority:</b> ${task.priority}</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${receiverEmail}`);
    } catch (error) {
        console.error("❌ Email sending error:", error.message);
        throw error;
    }
};