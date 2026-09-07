const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const withdrawal = require('../models/withdrawal'); // 👈 Ise sabse upar baki const ke sath jodein
const Razorpay = require('razorpay');
const crypto = require('crypto');
const winston = require('winston');
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [new winston.transports.Console()]
});
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const sendDualNotification = async ({ userId, fcmToken, socketEvent, title, body, screen, extraData = {} }) => {
    const payload = { screen, title, body, ...extraData };
    if (global.io && userId) {
        global.io.to(userId.toString()).emit(socketEvent, payload);
    }
    if (global.sendPushNotification && fcmToken) {
        await global.sendPushNotification(fcmToken, title, body, payload);
    }
};
// 🕒 Cancellation Policy Logic
function calculateCancellationFee(departureTime) {
    if (!departureTime) return { penaltyPercentage: 0, refundPercentage: 100 };
    const rideTime = new Date(departureTime);
    const now = new Date();
    const diffInHours = (rideTime - now) / (1000 * 60 * 60);
    if (diffInHours > 24) return { penaltyPercentage: 10, refundPercentage: 90 };
    else if (diffInHours > 5) return { penaltyPercentage: 20, refundPercentage: 80 };
    else if (diffInHours > 1) return { penaltyPercentage: 50, refundPercentage: 50 };
    else return { penaltyPercentage: 100, refundPercentage: 0 };
}

exports.publishRide = async (req, res) => {
    try {
      const { driverId, pickupLocation, dropLocation, departureTime, totalSeats, farePerSeat, fromDistrict, toDistrict } = req.body;

        if (!driverId || !pickupLocation || !dropLocation || !departureTime || !totalSeats || !farePerSeat) {
            return res.status(400).json({ message: "Error: All fields are required!" });
        }

        // 🔍 CHECK DRIVER STATUS: Direct Driver collection se check karo
        const driverProfile = await Driver.findById(driverId);

        // 📊 DEBUG LOGS (Duplicate variable error fixed here)
        console.log("-----------------------------------------");
        console.log("👉 App se aayi Driver ID:", driverId);
        console.log("📊 Database se aaya status:", driverProfile ? driverProfile.isVerified : "Driver Profile Not Found!");
        console.log("-----------------------------------------");
        
        if (!driverProfile) {
            return res.status(404).json({ message: "Error: Driver profile not found! Please pass a valid Driver ID." });
        }

        // 🔒 Strict verification filter check
        const currentStatus = String(driverProfile.isVerified).toLowerCase().trim();

        if (currentStatus !== 'approved') {
            return res.status(403).json({ 
                success: false, 
                message: `Error: You cannot publish a ride! Your verification status is '${driverProfile.isVerified}'. ⏳` 
            });
        }

       const newRide = new Ride({
    driver: driverProfile._id, 
    pickupLocation,
    dropLocation,
    fromDistrict: fromDistrict ? fromDistrict.trim() : "", 
    toDistrict: toDistrict ? toDistrict.trim() : "",      
    departureTime,
    totalSeats,
    availableSeats: totalSeats,
    farePerSeat,
    status: 'scheduled'
});

        await newRide.save();
        res.status(201).json({ message: "Ride Successfully Publish Ho Gayi! 🚕", ride: newRide });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};   
exports.requestBookRide = async (req, res) => {
    try {
        const { rideId, passengerId, seatsRequested, exactPickup, passengerName, passengerGender, passengerAge, passengerAvatar, passengerFcmToken } = req.body;

        // 🟢 FIX 1: Galat ID format se crash hone se bachayein
        if (!mongoose.Types.ObjectId.isValid(passengerId) || !mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ 
                message: "Error: Invalid ID format! User Id must be exactly 24 characters." 
            });
        }

        // 🟢 FIX 2: Ek hi baar declare kiya gaya hai
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Error: Ride not found!" });

        if (ride.availableSeats < seatsRequested) {
            return res.status(400).json({ message: "Error: Not enough seats available!" });
        }

        const alreadyRequested = ride.passengers.some(p => p.user.toString() === passengerId);
        if (alreadyRequested) {
            return res.status(400).json({ message: "Error: You have already requested this ride!" });
        }

        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString(); 
ride.passengers.push({
            user: passengerId,
            seatsBooked: seatsRequested,
            status: 'pending',
            otp: generatedOtp,
            exactPickup: exactPickup || 'N/A', 
            passengerName: passengerName,
            passengerGender: passengerGender,
            passengerAge: passengerAge,
            passengerAvatar: passengerAvatar,
            timeline: [{
                status: "Booking Requested",
                description: `You have requested ${seatsRequested} seat(s).`
            }]
        });

        await ride.save();
        // ✅ ADD THIS AFTER RIDE.SAVE():
        const User = require('../models/User');
        const passengerUser = await User.findById(passengerId);
        const driverDoc = await Driver.findById(ride.driver);
       await sendDualNotification({
    userId: ride.driver,
    fcmToken: driverDoc?.fcmToken,
    socketEvent: 'new_booking_request',
    title: "🚕 New Booking Request!",
    body: `Passenger has requested ${seatsRequested} seat(s).`,
    screen: "booking_request",
    extraData: { 
        rideId: ride._id.toString(), 
        passengerId: passengerId.toString(),
        driverId: ride.driver.toString() // 👈 Isko bhi add kar dein
    }
});
        return res.status(200).json({ 
            message: "Booking Request Sent! 📩", 
            otp: generatedOtp 
        });

    } catch (error) {
        console.error("🔥 BOOKING ERROR DETAILED:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
}; 
// Driver apni saari published rides aur unke pending passengers dekhega
exports.getDriverRides = async (req, res) => {
    try {
        const { driverId } = req.params;

        // 🟢 SAFE CHECK: Valid MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(driverId)) {
            return res.status(400).json({ success: false, message: "Invalid Driver ID Format!" });
        }

        // Driver collection se exact driver profile match karein
        const rides = await Ride.find({ driver: driverId })
            .populate('passengers.user', 'name phone avatar gender age') // Passenger ki details
            .sort({ createdAt: -1 });

        console.log(`🚕 Found ${rides.length} rides for Driver ID: ${driverId}`);

        return res.status(200).json({ success: true, rides });
    } catch (error) {
        console.error("🔥 GET DRIVER RIDES ERROR:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.rejectBookingRequest = async (req, res) => {
    try {
        const { rideId, passengerId } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Error: Ride not found!" });

        const passengerReq = ride.passengers.find(p => p.user.toString() === passengerId);
        if (!passengerReq) return res.status(404).json({ message: "Error: Passenger request not found!" });

        // 🟢 Agar pehle accepted thi aur reject ho gayi, toh seats wapas jodo
        if (passengerReq.status === 'accepted') {
            ride.availableSeats += passengerReq.seatsBooked;
        }

        passengerReq.status = 'rejected';

        // 🟢 Nayi timeline entry add karein
        passengerReq.timeline.push({
            status: "Request Rejected",
            description: "Driver has rejected your booking request."
        });

        await ride.save();

        const User = require('../models/User');
        const passengerUser = await User.findById(passengerId);

       await sendDualNotification({
            userId: passengerId,
            fcmToken: passengerUser?.fcmToken,
            socketEvent: 'booking_status_updated',
            title: "❌ Request Rejected",
            body: "Your booking request was rejected by the driver.",
            screen: "active_ride",
            extraData: { 
                rideId: rideId.toString(), 
                passengerId: passengerId.toString(),
                status: 'rejected' 
            }
        });

        res.status(200).json({ success: true, message: "Passenger Request Reject Ho Gayi!", ride });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};  
// 3. Driver passenger ki request accept karega
exports.acceptBookingRequest = async (req, res) => {
    try {
        const { rideId, passengerId } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Error: Ride not found!" });

        const passengerReq = ride.passengers.find(p => p.user.toString() === passengerId);
        if (!passengerReq) return res.status(404).json({ message: "Error: Passenger request not found!" });

        if (ride.availableSeats < passengerReq.seatsBooked) {
            return res.status(400).json({ message: "Error: Not enough seats available!" });
        }

        passengerReq.status = 'accepted';
        passengerReq.status = 'accepted';
        ride.availableSeats -= passengerReq.seatsBooked;

        // 🟢 Nayi timeline entry add karein (Accept hone par)
        passengerReq.timeline.push({
            status: "Request Accepted",
            description: "Driver has accepted your booking request."
        });

        await ride.save();
        ride.availableSeats -= passengerReq.seatsBooked;

        await ride.save();
        const User = require('../models/User');
        const passengerUser = await User.findById(passengerId);
await sendDualNotification({
            userId: passengerId,
            fcmToken: passengerUser?.fcmToken,
            socketEvent: 'booking_status_updated',
            title: "🎉 Request Accepted!",
            body: "Driver accepted your request, please complete payment.",
            screen: "payment_screen", 
            extraData: { 
                rideId: rideId.toString(), 
                passengerId: passengerId.toString(), // 👈 Yahan add karna hai!
                status: 'accepted' 
            }
        });
        res.status(200).json({ success: true, message: "Passenger Request Accept Ho Gayi! 🏎️", ride });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.startRide = async (req, res) => {
    try {
        const { rideId, passengerId, enteredOtp } = req.body; // Flutter se ye teeno cheezein aayengi

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Error: Ride not found!" });

        // Passenger find karke check karo ki kya uski request accepted hai
   const passengerReq = ride.passengers.find(p => p.user.toString() === passengerId && p.status === 'paid');
        if (!passengerReq) {
            return res.status(400).json({ message: "Error: No accepted booking found for this passenger!" });
        }


        // 🔒 OTP Match check (Anti-Fraud Lock)
        if (passengerReq.otp !== enteredOtp) {
            return res.status(400).json({ message: "Error: Invalid OTP! Please try again. ❌" });
        }

        ride.status = 'ongoing'; 
        await ride.save();

// ✅ Add this inside startRide function:
const User = require('../models/User');
const passengerUser = await User.findById(passengerId);

await sendDualNotification({
    userId: passengerId,
    fcmToken: passengerUser?.fcmToken,
    socketEvent: 'ride_started', // 👈 Ab yahan sahi event aayega
    title: "🚗 Ride Has Started!",
    body: "Driver has started the ride, live tracking is active.",
    screen: "passenger_live_map",
    extraData: { rideId: rideId.toString() }
});
        res.status(200).json({ message: "OTP Verified! Ride Shuru Ho Gayi Hai! 🛣️", ride });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
// 📜 PASSENGER RIDE HISTORY CONTROLLER
exports.getPassengerHistory = async (req, res) => {
  try {
    const { userId } = req.params;

const rides = await Ride.find({
      "passengers.user": userId // ✅ Exact schema field match
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      rides: rides
    });
  } catch (error) {
    console.error("❌ Error fetching passenger history:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server Error fetching history", 
      error: error.message 
    });
  }
};
exports.completeRide = async (req, res) => {
    try {
        const { rideId } = req.body;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Error: Ride not found!" });

        // 🔒 SAFETY CHECK: Agar pehle se complete ho chuki hai toh rok do
        if (ride.status === 'completed') {
            return res.status(400).json({ success: false, message: "Error: This ride is already completed!" });
        }

        if (ride.status !== 'ongoing') {
            return res.status(400).json({ message: "Error: Only ongoing rides can be completed!" });
        }

        let totalDriverEarning = 0;
        let totalPlatformCommission = 0;

        // Har paid passenger ka commission aur earning calculate hogi
        ride.passengers.forEach(passenger => {
            if (passenger.paymentStatus === 'paid') {
                const fareAmount = passenger.amountPaid || (passenger.seatsBooked * ride.farePerSeat);
                
                // 5% Platform Commission & Net Earning
                const commission = passenger.platformCommission || (fareAmount * 0.05); 
                const netDriverShare = passenger.driverEarning || (fareAmount - commission);

                totalPlatformCommission += commission;
                totalDriverEarning += netDriverShare;
            }
        });

        ride.status = 'completed'; 
        await ride.save();

        // 🟢 STEP 4: Settlement Window - Move from pendingBalance to walletBalance (Available)
        const driverDoc = await Driver.findById(ride.driver);
        if (driverDoc) {
            // Pending balance se uthao (agar pehle wahan gaya tha) ya direct add karo
            driverDoc.pendingBalance = Math.max(0, (driverDoc.pendingBalance || 0) - totalDriverEarning);
            driverDoc.walletBalance = (driverDoc.walletBalance || 0) + totalDriverEarning;
            await driverDoc.save();
        }
        try {
            const User = require('../models/User');

            // 1. Driver ko Earning Credited Push
            if (global.sendPushNotification && driverDoc && driverDoc.fcmToken) {
                await global.sendPushNotification(
                    driverDoc.fcmToken,
                    "💰 Earnings Available!",
                    `Ride complete ho gayi! Net Earning ₹${totalDriverEarning.toFixed(2)} aapke Available Wallet mein transfer ho gaye hain.`,
                    { screen: "driver_wallet", rideId: rideId.toString() }
                );
            }

            // 2. Sabhi Paid Passengers ko Trip Summary Push
            for (const p of ride.passengers) {
                if (p.paymentStatus === 'paid') {
                    const passengerUser = await User.findById(p.user);
                    if (global.sendPushNotification && passengerUser && passengerUser.fcmToken) {
                        await global.sendPushNotification(
                            passengerUser.fcmToken,
                            "🏁 Ride Completed Successfully!",
                            "Aapki yatra safaltapoorvak poori hui. Ride partner ke saath safar karne ke liye dhanyawad!",
                            { screen: "ride_history", rideId: rideId.toString() }
                        );
                    }
                }
            }
        } catch (notifErr) {
            console.log("⚠️ Complete Ride Notification Error:", notifErr.message);
        }
        return res.status(200).json({ 
            success: true,
            message: "Ride Safaltapoorvak Poori Hui! Funds Available Balance mein move ho gaye 🎉", 
            driverEarning: totalDriverEarning,
            platformCommission: totalPlatformCommission,
            ride 
        });
    } catch (error) {
        console.error("🔥 COMPLETE RIDE ERROR:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};    
exports.getAvailableRides = async (req, res) => {
    try {
        const { fromDistrict, toDistrict } = req.query;

        let query = { status: 'scheduled', availableSeats: { $gt: 0 } };

        if (fromDistrict && fromDistrict !== 'null' && fromDistrict !== '') {
            query.fromDistrict = new RegExp(fromDistrict.trim(), 'i');
        }
        if (toDistrict && toDistrict !== 'null' && toDistrict !== '') {
            query.toDistrict = new RegExp(toDistrict.trim(), 'i');
        }
        const rides = await Ride.find(query).populate({
            path: 'driver',
            populate: { 
                path: 'user', 
                select: 'name avatar phone age gender',
                strictPopulate: false 
            },
            strictPopulate: false
        });
        console.log(`✅ Rides Loaded Successfully: ${rides.length}`);
        return res.status(200).json({ count: rides.length, rides });
    } catch (error) {
        console.error("🔥 Search Error:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.createPaymentOrder = async (req, res) => {
    try {
        const { rideId, passengerId } = req.body;
        
        if (!rideId || !passengerId) {
            return res.status(400).json({ success: false, message: "Ride ID aur Passenger ID dena zaroori hai!" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ success: false, message: "Ride not found!" });
        const passengerReq = ride.passengers.find(p => p.user && p.user.toString().trim() === passengerId.toString().trim());
        
        if (!passengerReq) {
            console.log("❌ Debug - Missing Passenger Match for ID:", passengerId);
            console.log("📋 Available Passengers in Ride:", ride.passengers.map(p => p.user.toString()));
            return res.status(404).json({ success: false, message: "Passenger request not found!" });
        }

        if (passengerReq.status !== 'accepted') {
            return res.status(400).json({ success: false, message: "Driver has not accepted the request!" });
        }

        const totalAmount = passengerReq.seatsBooked * ride.farePerSeat;
        const options = {
            amount: totalAmount * 100,
            currency: "INR",
            receipt: `rcpt_${rideId.slice(-4)}_${passengerId.slice(-4)}`
        };
        const order = await razorpay.orders.create(options);
        passengerReq.razorpayOrderId = order.id;
        await ride.save();
        return res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Order creation failed", error: error.message });
    }
};
exports.verifyPayment = async (req, res) => {
    try {
        const { rideId, passengerId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        logger.info(`Payment verification started for rideId: ${rideId}, passengerId: ${passengerId}`);

        const bodyData = razorpayOrderId + "|" + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(bodyData.toString())
            .digest("hex");

        if (expectedSignature !== razorpaySignature) {
            logger.warn(`Invalid payment signature for rideId: ${rideId}, passengerId: ${passengerId}`);
            return res.status(400).json({ success: false, message: "Invalid payment signature!" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) {
            logger.warn(`Ride not found for rideId: ${rideId}`);
            return res.status(404).json({ success: false, message: "Ride not found!" });
        }

        const passengerReq = ride.passengers.find(p => p.user.toString() === passengerId);
        if (!passengerReq) {
            logger.warn(`Passenger record not found for rideId: ${rideId}, passengerId: ${passengerId}`);
            return res.status(404).json({ success: false, message: "Passenger record not found!" });
        }
        const totalAmount = passengerReq.seatsBooked * ride.farePerSeat;
        const commission = totalAmount * 0.05; // 5% Platform Commission
        const driverShare = totalAmount - commission; // Net Driver Earning

        passengerReq.status = 'paid';
        passengerReq.paymentStatus = 'paid';
        passengerReq.razorpayPaymentId = razorpayPaymentId;
        passengerReq.amountPaid = totalAmount;
        passengerReq.platformCommission = commission;
        passengerReq.driverEarning = driverShare;
        const driverDoc = await Driver.findById(ride.driver);
        if (driverDoc) {
            driverDoc.pendingBalance = (driverDoc.pendingBalance || 0) + driverShare;
            await driverDoc.save();
        }
        passengerReq.timeline.push({
            status: "Payment Confirmed",
            description: `Payment of ₹${totalAmount} successfully received via Razorpay.`
        });

        await ride.save();

        logger.info(`Payment verified successfully for rideId: ${rideId}, passengerId: ${passengerId}`);

        const User = require('../models/User');
        await sendDualNotification({
            userId: driverDoc?.user ? driverDoc.user.toString() : ride.driver, // 👈 Driver ki sahi User ID
            fcmToken: driverDoc?.fcmToken,
            socketEvent: 'payment_received',
            title: "💳 Payment Received!",
            body: "Passenger payment received, booking confirmed. Contact details unlocked.",
            screen: "driver_my_rides", 
            extraData: { rideId: rideId.toString() }
        });
        const passengerDoc = await User.findById(passengerId);
        await sendDualNotification({
            userId: passengerId,
            fcmToken: passengerDoc?.fcmToken,
            socketEvent: 'booking_status_updated',
            title: "✅ Payment Successful!",
            body: "Payment successful, ride confirmed.",
            screen: "active_ride",
            extraData: { rideId: rideId.toString(), otp: passengerReq.otp }
        });

        return res.status(200).json({
            success: true,
            message: "Payment successful! Booking confirmed and ride details unlocked 🎉",
            otp: passengerReq.otp
        });
    } catch (error) {
        logger.error(`Payment verification failed: ${error.message}`);
        return res.status(500).json({ success: false, message: "Payment verification failed", error: error.message });
    }
};
exports.getRideById = async (req, res) => {
    try {
        const { rideId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Invalid Ride ID Format!" });
        }

        const ride = await Ride.findById(rideId).populate({
            path: 'driver',
            populate: { 
                path: 'user', 
                select: 'name avatar phone age gender',
                strictPopulate: false 
            },
            strictPopulate: false
        });

        if (!ride) {
            return res.status(404).json({ success: false, message: "Error: Ride not found!" });
        }

        return res.status(200).json({ success: true, ride });
    } catch (error) {
        console.error("🔥 GET RIDE BY ID ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
       
// 🟢 GET ACTIVE DEMANDS CONTROLLER
exports.getActiveDemands = async (req, res) => {
    try {
        // Aap apni zaroorat ke hisaab se active demands ya scheduled rides ki query yahan likh sakte hain
        const activeRides = await Ride.find({ status: 'scheduled' }).sort({ createdAt: -1 });
        
        return res.status(200).json({
            success: true,
            count: activeRides.length,
            rides: activeRides
        });
    } catch (error) {
        console.error("🔥 GET ACTIVE DEMANDS ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
exports.cancelRide = async (req, res) => {
    try {
        const { rideId, cancelledBy, passengerId, cancellationReason } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ success: false, message: "Error: Ride not found!" });

        let passengerReq = null;
        if (passengerId) {
            passengerReq = ride.passengers.find(p => p.user.toString() === passengerId);
        }

        const policy = calculateCancellationFee(ride.departureTime);
        let refundAmount = 0;
        let penaltyAmount = 0;

        if (passengerReq && passengerReq.paymentStatus === 'paid' && passengerReq.amountPaid > 0) {
            const totalPaid = passengerReq.amountPaid;
            penaltyAmount = (totalPaid * policy.penaltyPercentage) / 100;
            refundAmount = (totalPaid * policy.refundPercentage) / 100;

            if (refundAmount > 0 && passengerReq.razorpayPaymentId) {
                try {
                    await razorpay.payments.refund(passengerReq.razorpayPaymentId, {
                        amount: Math.round(refundAmount * 100),
                        notes: {
                            reason: `Ride cancelled by ${cancelledBy}`,
                            rideId: rideId
                        }
                    });
                } catch (razorpayErr) {
                    console.log("Razorpay refund error:", razorpayErr.message);
                }
            }
        }

        const User = require('../models/User');
        const driverDoc = await Driver.findById(ride.driver);

     if (cancelledBy === 'passenger' && passengerReq) {
            // 🟢 Agar passenger ki request accepted thi, toh uski seats wapas available seats me jodo
            if (passengerReq.status === 'accepted' || passengerReq.status === 'paid') {
                ride.availableSeats += passengerReq.seatsBooked;
            }

            passengerReq.status = 'cancelled';
            const alreadyLogged = passengerReq.timeline.some(t => t.status.includes('Cancelled'));
            if (!alreadyLogged) {
                if (passengerReq.paymentStatus === 'paid' && refundAmount > 0) {
                    passengerReq.paymentStatus = 'refunded';
                    passengerReq.timeline.push({
                        status: "Ride Cancelled & Refund Initiated",
                        description: `Ride cancelled by passenger. Refund amount ₹${refundAmount} processing via Razorpay (5-7 days).`
                    });
               } else {
                    passengerReq.timeline.push({
                        status: "Ride Cancelled",
                        description: `Ride cancelled by passenger. No payment was made, so no charges applied.`
                    });
                }
            }
           await sendDualNotification({
                userId: driverDoc?.user ? driverDoc.user.toString() : ride.driver,
                fcmToken: driverDoc?.fcmToken,
                socketEvent: 'ride_cancelled_notification',
                title: "❌ Ride Cancelled by Passenger",
                body: "Passenger has cancelled the ride.",
                screen: "driver_my_rides", // Driver ke liye sahi page
                extraData: { 
                    rideId: rideId.toString(),
                    passengerId: passengerId.toString() 
                }
            });
       } else if (cancelledBy === 'driver') {
            ride.status = 'cancelled_by_driver';

            // 🕒 Driver Time-Based Penalty Calculation Logic
            const rideTime = new Date(ride.departureTime);
            const now = new Date();
            const diffInHours = (rideTime - now) / (1000 * 60 * 60);

            let penaltyAmount = 0;
            if (diffInHours > 24) {
                penaltyAmount = 100;
            } else if (diffInHours > 6) {
                penaltyAmount = 200;
            } else if (diffInHours > 1) {
                penaltyAmount = 250;
            } else {
                penaltyAmount = 300;
            }

            if (driverDoc) {
                driverDoc.walletBalance = (driverDoc.walletBalance || 0) - penaltyAmount;
                driverDoc.cancellationCount = (driverDoc.cancellationCount || 0) + 1;
                await driverDoc.save();
            }

            for (const p of ride.passengers) {
                // 🟢 Agar passenger ne pehle payment ki thi, toh uska amountPaid yaad rakho
                const wasPaid = p.paymentStatus === 'paid' || (p.amountPaid && p.amountPaid > 0);

                p.status = 'cancelled';
                if (wasPaid) {
                    p.paymentStatus = 'refunded';
                }
                
                p.cancellationReason = cancellationReason || 'Driver has cancelled the ride without a specific reason.';

                // 🟢 Duplicate timeline check for driver cancellation
                const alreadyLogged = p.timeline.some(t => t.status.includes('Cancelled by Driver'));
                if (!alreadyLogged) {
                    p.timeline.push({
                        status: "Cancelled by Driver",
                        description: `Driver has cancelled the ride. Reason: ${p.cancellationReason}`
                    });
                }

              const passengerUser = await User.findById(p.user);
                await sendDualNotification({
                    userId: p.user,
                    fcmToken: passengerUser?.fcmToken,
                    socketEvent: 'ride_cancelled_notification',
                    title: "❌ Ride Cancelled by Driver",
                    body: `Driver has cancelled the ride. Reason: ${p.cancellationReason}`,
                    screen: "active_ride", // 👈 'passenger_dashboard' ki jagah 'active_ride' karein
                    extraData: { 
                        rideId: rideId.toString(),
                        passengerId: p.user.toString() // 👈 Yeh passengerId add karna zaroori hai!
                    }
                });
            }
        }
        await ride.save();

        return res.status(200).json({
            success: true,
            message: `Ride successfully cancelled!`,
            refundAmount,
        });

    } catch (error) {
        console.error("🔥 CANCELLATION ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
exports.withdrawEarnings = async (req, res) => {
    try {
        const { driverId, amount, upiId } = req.body;

        if (!driverId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid amount!" });
        }

        if (!upiId || upiId.trim() === "") {
            return res.status(400).json({ success: false, message: "Please enter your UPI ID!" });
        }

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver profile not found!" });
        }

        const currentBalance = driver.walletBalance || 0;
        if (currentBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance! You have only ₹${currentBalance} in your wallet.` 
            });
        }
        
        try {
            const WithdrawalModel = require('../models/withdrawal'); 
            const newWithdrawal = new WithdrawalModel({
                driverId: driver._id,
                amount: Number(amount),
                upiId: upiId.trim(),
                status: 'Pending'
            });
            await newWithdrawal.save();
        } catch (modelErr) {
            console.log("⚠️ withdrawal model error:", modelErr.message);
        }

        driver.walletBalance = currentBalance - Number(amount);
        await driver.save();

        return res.status(200).json({
            success: true,
            message: "Withdrawal request successfully submitted! 💸",
            remainingWalletBalance: driver.walletBalance
        });

    } catch (error) {
        console.error("🔥 WITHDRAWAL ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.getWithdrawalHistory = async (req, res) => {
    try {
        const { driverId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(driverId)) {
            return res.status(400).json({ success: false, message: "Invalid Driver ID Format!" });
        }

        const history = await withdrawal.find({ driverId: driverId }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            history: history
        });
    } catch (error) {
        console.error("🔥 HISTORY FETCH ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};