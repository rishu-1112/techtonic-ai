import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import connectDB from "../config/db.js";

const createAdminUser = async () => {
    try {
        // Connect to database
        await connectDB();
        console.log("✅ Connected to MongoDB");

        const email = "rs139323@gmail.com";
        const password = "802156";
        const name = "Admin User";
        const employeeId = "ADMIN001";

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log("❌ User already exists with this email");
            process.exit(1);
        }

        // Hash password with bcryptjs
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create admin user
        const adminUser = new User({
            employeeId,
            name,
            email,
            password: hashedPassword,
            role: "admin",
            isActive: true
        });

        const savedUser = await adminUser.save();

        console.log("\n✅ Admin User Created Successfully!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📧 Email: ${email}`);
        console.log(`🔐 Password: ${password}`);
        console.log(`👤 Name: ${name}`);
        console.log(`🆔 Employee ID: ${employeeId}`);
        console.log(`👑 Role: admin`);
        console.log(`🔑 ID: ${savedUser._id}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating admin user:", error.message);
        process.exit(1);
    }
};

createAdminUser();
