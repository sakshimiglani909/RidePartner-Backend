const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); 
const dotenv = require('dotenv'); 
dotenv.config();
const User = require('../models/User');
const Driver = require('../models/Driver');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer'); 
const Withdrawal = require('../models/withdrawal');

const transporter = nodemailer.createTransport({
  service: "gmail",
  family: 4, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const otpDatabase = {};

exports.sendOtpController = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email field is required!" });
        }
        const emailKey = email.toLowerCase().trim();

        const userExists = await User.findOne({ email: emailKey });
        const driverExists = await Driver.findOne({ email: emailKey });
        
        if (userExists || driverExists) {
            return res.status(400).json({ 
                success: false, 
                message: "This email is already registered! Please login or use another email." 
            });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        otpDatabase[emailKey] = {
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000,
            isVerified: false
        };

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: emailKey,
            subject: 'Email Verification Code - Ride Partner App',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
                    <h2 style="color: #FF7A00;">Welcome to Ride Partner App!</h2>
                    <p>Your 6-digit email verification code (OTP) is:</p>
                    <h1 style="background: #FAF7F2; padding: 12px 24px; display: inline-block; letter-spacing: 5px; border-radius: 8px; color: #1F1F1F; margin: 10px 0;">${otp}</h1>
                    <p style="color: #888; font-size: 12px;">Note: This verification code is valid for 5 minutes only.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📡 OTP sent to [${emailKey}]: ${otp}`);
        return res.status(200).json({ success: true, message: "OTP sent successfully!" });

    } catch (error) {
        console.error("💥 Error sending email:", error);
        return res.status(500).json({ success: false, message: "Failed to send email.", error: error.message });
    }
};

exports.verifyOtpController = (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Email and OTP parameters are required." });
    }

    const emailKey = email.toLowerCase().trim();
    const record = otpDatabase[emailKey];

    if (!record) {
        return res.status(400).json({ success: false, message: "No OTP record found." });
    }

    if (Date.now() > record.expiresAt) {
        delete otpDatabase[emailKey];
        return res.status(400).json({ success: false, message: "OTP has expired!" });
    }

    if (record.otp === otp.trim()) {
        otpDatabase[emailKey].isVerified = true; 
        return res.status(200).json({ success: true, message: "Email verified successfully!" });
    } else {
        return res.status(400).json({ success: false, message: "Invalid OTP code." });
    }
};
exports.registerUser = async (req, res) => {
    try {
        const bodyData = req.body;
      const { 
            name, email, password, phone, age, gender, address, role,
            vehicleName, vehicleType, fcmToken // 👈 fcmToken add kiya
        } = bodyData;

        if (!name || !email || !password || !phone || !role) {
            return res.status(400).json({ success: false, message: "Required fields are missing." });
        }

        const emailKey = email.toLowerCase().trim();

        if (!otpDatabase[emailKey] || !otpDatabase[emailKey].isVerified) {
            return res.status(400).json({ success: false, message: "Please verify your email address before registering." });
        }

        let avatarUrl = "";
        let licensePhotoUrl = "";
        let rcPhotoUrl = "";

        if (req.files) {
            if (req.files['avatar'] && req.files['avatar'][0]) {
                avatarUrl = req.files['avatar'][0].path;
            }
            if (req.files['licensePhoto'] && req.files['licensePhoto'][0]) {
                licensePhotoUrl = req.files['licensePhoto'][0].path;
            }
            if (req.files['rcPhoto'] && req.files['rcPhoto'][0]) {
                rcPhotoUrl = req.files['rcPhoto'][0].path;
            }
        }

        const formattedRole = role.toLowerCase().trim();

        if (formattedRole === 'driver') {
            // ✂️ Humne yahan se licenseNumber aur vehicleNumber ka mandatory check hata diya hai
          // 🟢 Sahi code (vehicleType check):
if (!vehicleType) {
    return res.status(400).json({ success: false, message: "Vehicle type is required details." });
}

            const driverExists = await Driver.findOne({ $or: [{ email: emailKey }, { phone: phone.trim() }] });
            if (driverExists) {
                return res.status(400).json({ success: false, message: "Driver already exists with this email or phone." });
            }
           const newDriver = new Driver({
    name: name.trim(), 
    email: emailKey, 
    password, 
    phone: phone.trim(),
    age: age ? Number(age) : undefined, 
    gender, 
    address, 
    avatar: avatarUrl,             
    licensePhoto: licensePhotoUrl, 
    rcPhoto: rcPhotoUrl,           
    role: 'driver', 
    vehicleType: vehicleType.toLowerCase().trim(), // 👈 Yeh ensure karega ki 'car', 'bike', ya 'scooty' hi save ho
    isVerified: "pending",
    fcmToken: fcmToken || ""
});

            await newDriver.save();
            delete otpDatabase[emailKey];

            return res.status(201).json({ 
                success: true,
                message: "Driver Registered successfully! 🎉", 
                user: { id: newDriver._id, name: newDriver.name, email: newDriver.email, role: 'driver' }
            });
        } else {
            const userExists = await User.findOne({ $or: [{ email: emailKey }, { phone: phone.trim() }] });
            if (userExists) {
                return res.status(400).json({ success: false, message: "Email or phone number already registered." });
            }

            const newUser = new User({ 
                name: name.trim(), 
                email: emailKey, 
                password, 
                phone: phone.trim(),
                age: age ? Number(age) : undefined, 
                gender, 
                address, 
                avatar: avatarUrl, 
                role: 'user',
                fcmToken:fcmToken||""
            });

            await newUser.save();
            delete otpDatabase[emailKey];

            return res.status(201).json({ 
                success: true,
                message: "Passenger Registered successfully! 🎉", 
                user: { id: newUser._id, name: newUser.name, email: newUser.email, role: 'user' }
            });
        }
    } catch (error) {
        console.error("🔥 REGISTER ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during registration", error: error.message });
    }
};

   exports.loginUser = async (req, res) => {
    try {
        const { emailOrPhone, password, fcmToken, socketId } = req.body;
        if (!emailOrPhone || !password) {
            return res.status(400).json({ success: false, message: "Email/Phone and password are required." });
        }
        
        const searchKey = emailOrPhone.trim();
        const emailKey = emailOrPhone.toLowerCase().trim();

        let account = await User.findOne({ $or: [{ email: emailKey }, { phone: searchKey }] });
        let roleType = 'user';
        let driverId = null;

        if (!account) {
            account = await Driver.findOne({ $or: [{ email: emailKey }, { phone: searchKey }] });
            if (account) {
                roleType = 'driver';
                driverId = account._id.toString();
            }
        }

        if (!account) {
            return res.status(400).json({ success: false, message: "This account is not registered." });
        }

       const isMatch = await account.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid email/phone or password." });
        }

        // 🟢 FIX: Login ke waqt hi FCM Token aur Socket ID ko database me save karein
        if (fcmToken) {
            account.fcmToken = fcmToken;
        }
        if (socketId) {
            account.socketId = socketId;
        }
        await account.save();
        console.log(`📲 Login Par Token Save Ho Gaya: ${roleType} (${account._id}) -> Token: ${fcmToken || "N/A"}`);
       // 🟢 Clean Token Update & Save Logic
        let isTokenUpdated = false;
        if (fcmToken && fcmToken.trim() !== "" && account.fcmToken !== fcmToken) {
            account.fcmToken = fcmToken;
            isTokenUpdated = true;
        }
        if (socketId && socketId.trim() !== "" && account.socketId !== socketId) {
            account.socketId = socketId;
            isTokenUpdated = true;
        }

        if (isTokenUpdated) {
            await account.save();
            console.log(`📲 Updated Tokens for ${roleType} (${account._id}) -> FCM: ${fcmToken || "N/A"}, Socket: ${socketId || "N/A"}`);
        }


        const token = jwt.sign(
            { userId: account._id, role: roleType, driverId: driverId },
            process.env.JWT_SECRET || "supersecretkey",
            { expiresIn: '1d' }
        );

        return res.status(200).json({
            success: true,
            message: "Login Successful! 🎉",
            token,
            role: roleType,
            driverId: driverId,
            user: { 
                id: account._id, 
                name: account.name, 
                email: account.email, 
                role: roleType, 
                driverId: driverId 
            }
        });
    } catch (error) {
        console.error("🔥 LOGIN ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
exports.logoutUser = async (req, res) => {
    try {
        return res.status(200).json({ success: true, message: "Logout Successful! 👋" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        const emailKey = email.toLowerCase().trim();
        const user = await User.findOne({ email: emailKey });
        const driver = await Driver.findOne({ email: emailKey });

        if (!user && !driver) {
            return res.status(404).json({ success: false, message: "This email is not registered." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        otpDatabase[emailKey] = {
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000,
            isVerified: false
        };

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: emailKey,
            subject: 'Password Reset Verification Code',
            html: `<p>Your password reset OTP code is: <b>${otp}</b></p>`
        };
        
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true, message: "Password reset OTP sent to your email! 📩" });
    } catch (error) {
        console.error("🔥 FORGOT PASSWORD ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        const emailKey = email.toLowerCase().trim();
        const otpRecord = otpDatabase[emailKey];

        if (!otpRecord || otpRecord.otp !== otp.trim()) {
            return res.status(400).json({ success: false, message: "Invalid verification token or OTP." });
        }

        if (Date.now() > otpRecord.expiresAt) {
            delete otpDatabase[emailKey];
            return res.status(400).json({ success: false, message: "OTP has expired. Please try again." });
        }

        let account = await User.findOne({ email: emailKey });
        if (!account) {
            account = await Driver.findOne({ email: emailKey });
        }

        if (!account) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        account.password = newPassword;
        await account.save();

        delete otpDatabase[emailKey];
        return res.status(200).json({ success: true, message: "Password updated successfully! 🎉" });
    } catch (error) {
        console.error("🔥 RESET PASSWORD ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.getDriverStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const driver = await Driver.findById(id);

        if (!driver) {
            const user = await User.findOne({ _id: id });
            if (user) {
                return res.status(200).json({
                    success: true,
                    isVerified: "approved",
                    vehicleType: "car",
                    driver: {
                        name: user.name,
                        phone: user.phone,
                        email: user.email,
                        vehicleType: "car",
                        isVerified: "approved"
                    }
                });
            }
            return res.status(404).json({ success: false, message: "Account not found!" });
        }

        // 🟢 Yahan vehicleType aur driver object dono return kar rahe hain taaki Profile aur Post Ride dono theek chalein
        return res.status(200).json({
            success: true,
            isVerified: driver.isVerified || "pending",
            vehicleType: driver.vehicleType || "bike",
           driver: {
                name: driver.name,
                phone: driver.phone,
                email: driver.email,
                vehicleType: driver.vehicleType || "bike",
                isVerified: driver.isVerified || "pending",
                gender: driver.gender || "Not Specified",
                age: driver.age || "N/A"
            },
            rejectionReason: driver.rejectionReason || "",
            rejectedFields: driver.rejectedFields || []
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
      
// 📱 SOCKET ID AUR FCM TOKEN UPDATE CONTROLLER (FIXED & ROBUST)
exports.updateDeviceTokens = async (req, res) => {
    try {
        const { userId, socketId, fcmToken } = req.body;

        // 🟢 Sabse pehle ye log daal:
        console.log("📥 updateDeviceTokens API HIT! Data:", req.body);

        if (!userId) {
            console.log("❌ Error: userId missing in body!");
            return res.status(400).json({ success: false, message: "UserId is required!" });
        }

        // 1. Pehle Driver Collection me check aur update karo
        let account = await Driver.findById(userId);
        if (account) {
            if (socketId !== undefined) account.socketId = socketId;
            if (fcmToken !== undefined) account.fcmToken = fcmToken;
            await account.save();
            console.log(`✅ Driver Token Updated: ${account._id} -> Token: ${fcmToken || "N/A"}`); // 🟢 Success log
            return res.status(200).json({ success: true, message: "Driver Tokens Updated Successfully! 🚗", account });
        }
        account = await User.findById(userId);
        if (account) {
            if (socketId !== undefined) account.socketId = socketId;
            if (fcmToken !== undefined) account.fcmToken = fcmToken;
            await account.save();
            console.log(`✅ User Token Updated: ${account._id} -> Token: ${fcmToken || "N/A"}`); // 🟢 Success log
            return res.status(200).json({ success: true, message: "Passenger Tokens Updated Successfully! 🧍", account });
        }

        console.log(`❌ Account not found for ID: ${userId}`); // 🟢 Log if ID is wrong
        return res.status(404).json({ success: false, message: "Account not found!" });
    } catch (error) {
        console.error("🔥 TOKEN UPDATE ERROR DETAIL:", error); // 🟢 Ye error ab print hoga!
        return res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 🔄 DRIVER RE-UPLOAD SPECIFIC DOCUMENTS CONTROLLER (SEPARATE INDEPENDENT FUNCTION)
exports.resubmitDocument = async (req, res) => {
    try {
        const { driverId } = req.body;

        if (!driverId) {
            return res.status(400).json({ success: false, message: "Driver ID is required!" });
        }

        let updateData = {
            isVerified: 'pending',   // Status dobara pending taaki admin verify kar sake
            isResubmitted: true      // 🏷️ Admin Panel par highlight dikhane ke liye flag!
        };

        let updatedDocs = [];

        // Check Multer req.files parsing
        if (req.files) {
            if (req.files['licensePhoto'] && req.files['licensePhoto'][0]) {
                updateData.licensePhoto = req.files['licensePhoto'][0].path;
                updatedDocs.push("License Photo");
            }
            if (req.files['rcPhoto'] && req.files['rcPhoto'][0]) {
                updateData.rcPhoto = req.files['rcPhoto'][0].path;
                updatedDocs.push("RC Photo");
            }
            if (req.files['avatar'] && req.files['avatar'][0]) {
                updateData.avatar = req.files['avatar'][0].path;
                updatedDocs.push("Face Scan");
            }
        }

        updateData.lastUpdatedDoc = updatedDocs.join(", ");

        const driver = await Driver.findByIdAndUpdate(driverId, updateData, { new: true });

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver account not found!" });
        }

        // Driver profile/status fetch controller mein yeh fields honi chahiye:
return res.status(200).json({
    success: true,
    driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        isVerified: driver.isVerified,
        walletBalance: driver.walletBalance || 0,     // 👈 Yeh zaroor hona chahiye
        pendingBalance: driver.pendingBalance || 0,   // 👈 Yeh bhi
        penaltyDue: driver.penaltyDue || 0,           // 👈 Yeh bhi
    }
});
    } catch (error) {
        console.error("🔥 RESUBMIT ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during resubmission", error: error.message });
    }
};
// 💳 GET DRIVER WALLET & EARNINGS CONTROLLER
// 💳 GET DRIVER WALLET & EARNINGS CONTROLLER (Safe & Error-Proof)
exports.getDriverWallet = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id.length !== 24 || id.includes('$')) {
            return res.status(400).json({ success: false, message: "Invalid Driver ID format!" });
        }

        const driver = await Driver.findById(id);

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver account not found!" });
        }

        return res.status(200).json({
            success: true,
            walletBalance: driver.walletBalance || 0,
            pendingBalance: driver.pendingBalance || 0,
            penaltyDue: driver.penaltyDue || 0,
        });
    } catch (error) {
        console.error("🔥 WALLET FETCH ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
// 👤 GET DRIVER PROFILE & WALLET CONTROLLER (Flutter App Fix)
exports.getDriverProfile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id.length !== 24) {
            return res.status(400).json({ success: false, message: "Invalid Driver ID format!" });
        }

        const driver = await Driver.findById(id);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver profile not found!" });
        }

        // 🟢 Sahi JSON response jo Flutter app expect kar rahi hai
        return res.status(200).json({
            success: true,
            name: driver.name,
            email: driver.email,
            phone: driver.phone,
            walletBalance: driver.walletBalance || 0,
            pendingBalance: driver.pendingBalance || 0,
            penaltyDue: driver.penaltyDue || 0,
            isVerified: driver.isVerified,
            vehicleType: driver.vehicleType,
            avatar: driver.avatar
        });
    } catch (error) {
        console.error("🔥 GET DRIVER PROFILE ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
// 👤 GET PASSENGER PROFILE CONTROLLER
exports.getPassengerProfile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id.length !== 24) {
            return res.status(400).json({ success: false, message: "Invalid User ID format!" });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "Passenger profile not found!" });
        }

        return res.status(200).json({
            success: true,
            user: {
                name: user.name,
                email: user.email || 'Not Provided',
                phone: user.phone || 'N/A',
                gender: user.gender || 'Not Specified',
                age: user.age || 'N/A',
                avatar: user.avatar || ''
            }
        });
    } catch (error) {
        console.error("🔥 GET PASSENGER PROFILE ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};