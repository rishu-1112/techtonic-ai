import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import connectDB from "../config/db.js";

const updateToAdminUser = async () => {
    try {
        // Connect to database
        await connectDB();
        console.log("✅ Connected to MongoDB");

        const email = "rs139323@gmail.com";
        const password = "802156";
        const name = "Admin User";
        const employeeId = "ADMIN001";

        // Find existing user
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            console.log("❌ User does not exist. Creating new admin user...\n");
            
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

            console.log("✅ Admin User Created Successfully!");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`📧 Email: ${email}`);
            console.log(`🔐 Password: ${password}`);
            console.log(`👤 Name: ${name}`);
            console.log(`🆔 Employee ID: ${employeeId}`);
            console.log(`👑 Role: admin`);
            console.log(`🔑 ID: ${savedUser._id}`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            
            process.exit(0);
        }

        // Update existing user to admin
        console.log("Found existing user. Updating to admin...\n");
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const updatedUser = await User.findByIdAndUpdate(
            existingUser._id,
            {
                employeeId,
                name,
                password: hashedPassword,
                role: "admin",
                isActive: true
            },
            { new: true }
        );

        console.log("✅ User Updated to Admin Successfully!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📧 Email: ${updatedUser.email}`);
        console.log(`🔐 Password: ${password}`);
        console.log(`👤 Name: ${updatedUser.name}`);
        console.log(`🆔 Employee ID: ${updatedUser.employeeId}`);
        console.log(`👑 Role: ${updatedUser.role}`);
        console.log(`🔑 ID: ${updatedUser._id}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

updateToAdminUser();
