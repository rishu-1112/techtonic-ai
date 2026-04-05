import cron from "node-cron";
import Task from "../models/Task.js";
import { sendTaskEmail } from "./mailer.js";
import { parseDeadline } from "../utils/taskHelpers.js";

// Run every minute
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        
        // Find incomplete tasks (pending or in-progress)
        const tasks = await Task.find({ status: { $in: ["pending", "in-progress"] } });

        for (const task of tasks) {
            if (!task.deadline) continue;

            let deadline = new Date(task.deadline);
            if (isNaN(deadline.getTime())) {
                deadline = parseDeadline(task.deadline);
            }

            if (!deadline || isNaN(deadline.getTime())) continue;

            const diff = (deadline - now) / (1000 * 60); // minutes
            if (diff < 0) continue;

            const hasOneHourReminder = task.reminderSent?.oneHour;
            const hasOneDayReminder = task.reminderSent?.oneDay;

            // ⏰ 1 hour before (one-minute window)
            if (diff >= 59 && diff <= 61 && !hasOneHourReminder) {
                console.log(`Sending 1-hour reminder for task: ${task.taskName || task.task}`);

                await task.populate("assignedTo", "name email");
                await sendTaskEmail({
                    ...task.toObject(),
                    assignedToEmail: task.assignedToEmail || task.assignedTo?.email,
                    assignedToName: task.assignedToName || task.assignedTo?.name || "",
                    isReminder: true,
                    reminderType: "1-hour"
                });

                task.reminderSent = {
                    ...task.reminderSent,
                    oneHour: true
                };
                await task.save();
            }

            // ⏰ 1 day before (one-minute window)
            if (diff >= 1439 && diff <= 1441 && !hasOneDayReminder) {
                console.log(`Sending 1-day reminder for task: ${task.taskName || task.task}`);

                await task.populate("assignedTo", "name email");
                await sendTaskEmail({
                    ...task.toObject(),
                    assignedToEmail: task.assignedToEmail || task.assignedTo?.email,
                    assignedToName: task.assignedToName || task.assignedTo?.name || "",
                    isReminder: true,
                    reminderType: "1-day"
                });

                task.reminderSent = {
                    ...task.reminderSent,
                    oneDay: true
                };
                await task.save();
            }
        }
    } catch (error) {
        console.error("Cron Error:", error);
    }
});

console.log("Cron jobs initialized 🕒");
