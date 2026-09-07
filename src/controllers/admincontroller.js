const Driver = require('../models/Driver');
const sendDualNotification = async ({ userId, fcmToken, socketEvent, title, body, screen, extraData = {} }) => {
    const payload = { screen, title, body, ...extraData };

    // 🟢 1. Socket Emit Safe Check
    if (global.io && userId) {
        try {
            const roomId = userId.toString();
            global.io.to(roomId).emit(socketEvent, payload);
            console.log(`🟢 Socket Emitted [${socketEvent}] to Room: ${roomId}`);
        } catch (socketErr) {
            console.log("❌ Socket Emit Error:", socketErr.message);
        }
    }
    // 🟢 2. Push Notification Safe Check
    if (global.sendPushNotification && fcmToken) {
        try {
            await global.sendPushNotification(fcmToken, title, body, payload);
            console.log(`📱 Push Notification Sent Successfully!`);
        } catch (err) {
            console.log("❌ Push Error Details:", err.message);
        }
    }
};
const WhatsAppLog = require('../models/WhatsAppLog');
const { sendWhatsAppNotification } = require('../services/whatsappService');

// Admin WhatsApp Send Controller
exports.sendAdminWhatsApp = async (req, res) => {
    try {
        const { target, driverIds, message } = req.body; 

        if (!message) {
            return res.status(400).json({ success: false, message: "Message text is required!" });
        }

        let driversQuery = { isVerified: 'approved' };
        if (target === 'specific' && driverIds && driverIds.length > 0) {
            driversQuery._id = { $in: driverIds };
        }

        const targetDrivers = await Driver.find(driversQuery);
        if (!targetDrivers || targetDrivers.length === 0) {
            return res.status(404).json({ success: false, message: "No eligible drivers found!" });
        }

        let results = [];
        for (const driver of targetDrivers) {
            if (driver.phone) {
                const response = await sendWhatsAppNotification(driver._id, driver.phone, message);
                results.push({ driverId: driver._id, phone: driver.phone, ...response });
            }
        }

        return res.status(200).json({
            success: true,
            message: `WhatsApp notifications triggered for ${targetDrivers.length} driver(s).`,
            results
        });
    } catch (error) {
        console.log("🔥 Admin WhatsApp Error:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Admin Report Controller
exports.getWhatsAppReport = async (req, res) => {
    try {
        const totalSent = await WhatsAppLog.countDocuments({ status: 'sent' });
        const totalFailed = await WhatsAppLog.countDocuments({ status: 'failed' });
        
        const logs = await WhatsAppLog.find()
            .populate('driver', 'name phone vehicleType')
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({
            success: true,
            stats: { totalSent, totalFailed },
            logs
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
exports.approveDriver = async (req, res) => {
    console.log("📥 Admin Approve Request Received Body:", req.body);
    try {
        const { driverId } = req.body;
        if (!driverId) {
            return res.status(400).json({ message: "driverId is required!" });
        }
        // 🟢 1. Pehle driver ko database se dhoondhein aur populate karein
        const driver = await Driver.findById(driverId).populate('user');
        if (!driver) {
            console.log("❌ Driver not found ID:", driverId);
            return res.status(404).json({ message: "Driver ID not found in database!" });
        }

        // 🟢 2. Fields update karein aur save karein
        driver.isVerified = 'approved';
        driver.rejectionReason = '';
        driver.rejectedFields = [];
        driver.isResubmitted = false;
        driver.lastUpdatedDoc = '';
        await driver.save();

        // 🟢 3. Safe target token extraction (Driver model ya User model se)
        const targetToken = driver.fcmToken || driver.user?.fcmToken || "";
        console.log("📱 Target FCM Token for Push:", targetToken);

        await sendDualNotification({
            userId: driver._id,
            fcmToken: targetToken,
            socketEvent: 'driver_status_updated',
            title: "Account Approved! 🎉",
            body: "Congratulations! Your driver account has been approved. You can now post rides.",
            screen: "driver_dashboard",
            extraData: { status: 'approved' }
        });

        res.status(200).json({ message: "Driver successfully approved!" });
    } catch (error) {
        console.log("❌ Approve API Error Detail:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 🟢 2. REJECT DRIVER (FIXED)
exports.rejectDriver = async (req, res) => {
    console.log("📥 Admin Reject Request Received Body:", req.body);
    try {
        const { driverId, reason, rejectedFields } = req.body;
        if (!reason) return res.status(400).json({ message: "Rejection reason is required!" });

        const driver = await Driver.findByIdAndUpdate(
            driverId, 
            { 
                isVerified: 'rejected', 
                rejectionReason: reason,
                rejectedFields: rejectedFields || [], 
                isResubmitted: false 
            },
            { new: true }
        ).populate('user');

        if (!driver) return res.status(404).json({ message: "Driver not found!" });

        const targetToken = driver.fcmToken || driver.user?.fcmToken || "";
        console.log("📱 Target FCM Token for Reject Push:", targetToken);

        await sendDualNotification({
            userId: driver._id,
            fcmToken: targetToken,
            socketEvent: 'driver_status_updated',
            title: "Verification Failed ❌",
            body: `Your driver application was rejected. Reason: ${reason}`,
            screen: "reupload_documents",
            extraData: { status: 'rejected', reason, rejectedFields: JSON.stringify(rejectedFields || []) }
        });

        res.status(200).json({ message: "Driver rejected and notification sent." });
    } catch (error) {
        console.log("❌ Reject API Error:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
// 🟢 3. SUBMIT APPLICATION
exports.submitDriverApplication = async (req, res) => {
    try {
        const { driverId } = req.body;
        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { isVerified: 'pending', isResubmitted: true },
            { new: true }
        );
        if (!driver) return res.status(404).json({ message: "Driver not found!" });

        if (global.io) {
            global.io.emit('new_driver_application', {
                driverId: driver._id,
                message: "New driver verification request received"
            });
        }

        res.status(200).json({ success: true, message: "Application submitted successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 🟢 4. SUSPEND DRIVER
exports.suspendDriver = async (req, res) => {
    try {
        const { driverId } = req.body;
        const driver = await Driver.findById(driverId).populate('user');
        if (!driver) return res.status(404).json({ message: "Driver not found!" });

        const targetToken = driver.fcmToken || driver.user?.fcmToken || "";

        await sendDualNotification({
            userId: driver._id,
            fcmToken: targetToken,
            socketEvent: 'driver_status_updated',
            title: "Account Suspended ⚠️",
            body: "Your account has been temporarily suspended. Contact support for details.",
            screen: "login_screen",
            extraData: { status: 'suspended' }
        });

        driver.isVerified = 'suspended';
        driver.fcmToken = '';
        await driver.save();

        res.status(200).json({ success: true, message: "Driver account suspended." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.unblockDriver = async (req, res) => {
    try {
        const { driverId } = req.body;
        
        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { isVerified: 'approved' },
            { new: true }
        ).populate('user');

        if (!driver) return res.status(404).json({ message: "Driver not found!" });

        const targetToken = driver.fcmToken || driver.user?.fcmToken || "";

        await sendDualNotification({
            userId: driver._id,
            fcmToken: targetToken,
            socketEvent: 'driver_status_updated',
            title: "Account Reactivated 🎉",
            body: "Your account has been reactivated successfully.",
            screen: "driver_dashboard",
            extraData: { status: 'approved' }
        });
        res.status(200).json({ success: true, message: "Driver account unblocked successfully." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
// 📊 ADMIN OVERSIGHT & FINANCIAL LEDGER CONTROLLER (Step 10 Added)
exports.getAdminFinancialLedger = async (req, res) => {
    try {
        const Ride = require('../models/Ride'); // Ride model import

        // Saari rides fetch karein jisme passengers aur financial data ho
        const rides = await Ride.find({})
            .populate('driver', 'name phone email walletBalance pendingBalance penaltyDue cancellationCount')
            .sort({ createdAt: -1 });

        let totalPlatformRevenue = 0;
        let totalPenaltiesCollected = 0;
        let activeDisputesCount = 0;

        const ledgerSummary = rides.map(ride => {
            let rideCommission = 0;
            ride.passengers.forEach(p => {
                if (p.paymentStatus === 'paid') {
                    rideCommission += (p.platformCommission || 0);
                }
                if (p.status === 'cancelled') {
                    activeDisputesCount++;
                }
            });
            totalPlatformRevenue += rideCommission;

            return {
                rideId: ride._id,
                driverId: ride.driver?._id,
                driverName: ride.driver?.name,
                status: ride.status,
                departureTime: ride.departureTime,
                passengersCount: ride.passengers.length,
                commissionEarned: rideCommission,
                createdAt: ride.createdAt
            };
        });

        // Saare drivers ki penalties ka total
        const drivers = await Driver.find({});
        drivers.forEach(d => {
            totalPenaltiesCollected += (d.penaltyDue || 0);
        });

        return res.status(200).json({
            success: true,
            financialOverview: {
                totalPlatformRevenue,
                totalPenaltiesCollected,
                activeDisputesCount,
                totalRidesTracked: rides.length
            },
            ledgerSummary
        });

    } catch (error) {
        console.error("🔥 ADMIN LEDGER ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};