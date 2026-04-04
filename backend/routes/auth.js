import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Register Route
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Please enter all fields" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            password: hashedPassword
        });

        const savedUser = await newUser.save();

        const token = jwt.sign(
            { id: savedUser._id, name: savedUser.name, email: savedUser.email, role: savedUser.role },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "1d" }
        );

        res.json({
            token,
            user: { 
                id: savedUser._id, 
                name: savedUser.name, 
                email: savedUser.email,
                role: savedUser.role,
                empId: savedUser.employeeId
            }
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Server error during registration" });
    }
});

// Login Route
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Please enter all fields" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, email: user.email, role: user.role },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "1d" }
        );

        res.json({
            token,
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email,
                role: user.role,
                empId: user.employeeId
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

// Get all employees (for admin task assignment)
router.get("/employees", requireAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: "employee" })
            .select("_id name email employeeId")
            .sort({ name: 1 });

        res.json(employees);
    } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({ error: "Failed to fetch employees" });
    }
});

export default router;
