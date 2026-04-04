import cron from "node-cron";
import Task from "../models/Task.js";
import { sendTaskEmail } from "./mailer.js";

// Run every minute
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        
        // Find tasks that are pending
        const tasks = await Task.find({ status: "pending" });

        for (const task of tasks) {
            if (!task.deadline) continue;

            const deadline = new Date(task.deadline);
            const diff = (deadline - now) / (1000 * 60); // minutes

            // ⏰ 1 hour before
            if (diff <= 60 && diff > 59) {
                console.log(`Sending 1-hour reminder for task: ${task.task}`);
                await sendTaskEmail(task);
            }

            // ⏰ 1 day before
            if (diff <= 1440 && diff > 1439) {
                console.log(`Sending 1-day reminder for task: ${task.task}`);
                await sendTaskEmail(task);
            }
        }
    } catch (error) {
        console.error("Cron Error:", error);
    }
});

console.log("Cron jobs initialized 🕒");
