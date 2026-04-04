import User from "../models/User.js";

const escapeRegExp = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const parseDeadline = (deadlineText) => {
    if (!deadlineText || typeof deadlineText !== "string") {
        return null;
    }

    const normalized = deadlineText.trim().toLowerCase();
    const endOfDay = (date) => {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
    };

    if (["today", "आज"].includes(normalized)) {
        return endOfDay(new Date());
    }

    if (["tomorrow", "कल"].includes(normalized)) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return endOfDay(d);
    }

    if (["day after tomorrow", "परसों", "parsoon"].some((token) => normalized.includes(token))) {
        const d = new Date();
        d.setDate(d.getDate() + 2);
        return endOfDay(d);
    }

    if (["eod", "end of day", "by end of day", "आज रात", "शाम"].some((token) => normalized.includes(token))) {
        return endOfDay(new Date());
    }

    const parsed = new Date(deadlineText);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
};

const findUserByPersonOrEmpId = async (nameOrId) => {
    if (!nameOrId || typeof nameOrId !== "string") {
        return null;
    }

    const cleaned = nameOrId.trim().replace(/[:,]$/, "");
    if (!cleaned) {
        return null;
    }

    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleaned);
    const idQuery = /^[0-9a-fA-F]{24}$/.test(cleaned) ? { _id: cleaned } : null;
    const regex = new RegExp(`^${escapeRegExp(cleaned)}(?:\\s|$)`, "i");

    const query = {
        $or: [
            { name: regex },
            { employeeId: cleaned }
        ]
    };

    if (isEmail) {
        query.$or.push({ email: cleaned.toLowerCase() });
    }

    if (idQuery) {
        query.$or.push(idQuery);
    }

    return await User.findOne(query);
};

export const normalizeExtractedTask = async (taskData, uploaderId) => {
    const taskName = (taskData.task || taskData.taskName || taskData.description || "").trim();
    const rawPerson = (taskData.assignedTo || taskData.person || "").trim();
    let empId = taskData.empId?.toString().trim() || taskData.employeeId?.toString().trim() || "";
    let assignee = null;

    if (empId) {
        assignee = await User.findOne({ employeeId: empId });
    }

    if (!assignee && rawPerson) {
        assignee = await findUserByPersonOrEmpId(rawPerson);
    }

    if (assignee && !empId) {
        empId = assignee.employeeId;
    }

    const deadline = parseDeadline(taskData.deadline || taskData.date || taskData.dueDate);
    const priority = ["High", "Medium", "Low"].includes(taskData.priority)
        ? taskData.priority
        : "Low";
    const description = (taskData.notes || taskData.description || taskData.task || "").trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawPerson);

    return {
        taskName,
        empId,
        assignedTo: assignee?._id || null,
        assignedToName: rawPerson || "",
        assignedToEmail: isEmail ? rawPerson.toLowerCase() : "",
        assignedBy: uploaderId || null,
        deadline,
        priority,
        description
    };
};
