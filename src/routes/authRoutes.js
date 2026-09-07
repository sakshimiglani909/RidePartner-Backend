const express = require('express');
const router = express.Router();
const { 
    registerUser, 
    loginUser, 
    logoutUser, 
    sendOtpController, 
    verifyOtpController,
    forgotPassword, 
    resetPassword,
    getDriverStatus,
    updateDeviceTokens,
    resubmitDocument 
} = require('../controllers/authcontroller');

const upload = require('../db/cloudinary');
const Driver = require('../models/Driver');
const User = require('../models/User'); // 👈 User model yahan zaroor import hona chahiye
const Withdrawal = require('../models/withdrawal');

// AUTH ENDPOINTS
router.post('/send-otp', sendOtpController);
router.post('/verify-otp', verifyOtpController);

// ✨ REGISTER
router.post('/register', upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'licensePhoto', maxCount: 1 },
    { name: 'rcPhoto', maxCount: 1 }
]), registerUser);

router.post('/login', loginUser); 
router.post('/logout', logoutUser);
router.get('/profile/:id', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        
        if (!driver) {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ success: false, message: "User or Driver not found" });
            }
            // 🟢 Passenger ke liye proper structured user object bhejein
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
        }
        
        // Agar Driver hai toh driver data return karein
        return res.status(200).json({ 
            success: true, 
            user: {
                name: driver.name,
                email: driver.email || 'Not Provided',
                phone: driver.phone || 'N/A',
                gender: driver.gender || 'Not Specified',
                age: driver.age || 'N/A',
                avatar: driver.avatar || ''
            },
            walletBalance: driver.walletBalance || 0,
            pendingBalance: driver.pendingBalance || 0,
            penaltyDue: driver.penaltyDue || 0,
            driver 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/driver/status/:id', getDriverStatus);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// 🔄 DRIVER RE-UPLOAD DOCUMENT ROUTE
router.post('/resubmit-document', upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'licensePhoto', maxCount: 1 },
    { name: 'rcPhoto', maxCount: 1 }
]), resubmitDocument);

// 🟢 Socket ID & FCM Token DB me Update Karne Ka Route
router.post('/update-tokens', updateDeviceTokens);

// 💸 WITHDRAWAL EARNINGS ROUTE
router.post('/rides/withdraw-earnings', async (req, res) => {
    try {
        const { driverId, amount, upiId } = req.body;
        
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        if (driver.walletBalance < amount) {
            return res.status(400).json({ success: false, message: "You don't have enough balance to withdraw!" });
        }

        if (!upiId) {
            return res.status(400).json({ success: false, message: "Please provide your UPI ID!" });
        }

        driver.walletBalance -= amount;
        await driver.save();

        const newwithdrawal = new Withdrawal({
            driverId,
            amount,
            upiId,
            status: 'Pending'
        });
        await newwithdrawal.save();

        return res.status(200).json({ 
            success: true, 
            message: `Withdrawal request of ₹${amount} submitted successfully! `,
            remainingWalletBalance: driver.walletBalance
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 📜 DRIVER WITHDRAWAL HISTORY ROUTE
router.get('/rides/withdrawal-history/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const history = await Withdrawal.find({ driverId }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            history
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;