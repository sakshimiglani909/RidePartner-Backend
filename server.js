require('dotenv').config();

console.log("Mongo URL loaded:", !!process.env.MONGODB_URL);

const app = require("./src/app");
const http = require('http');
const { Server } = require('socket.io');
const User = require('./src/models/User');     
const Driver = require('./src/models/Driver'); 
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes');
const rideRoutes = require('./src/routes/rideRoutes'); // 👈 Yeh line yahan add karein
app.use(cors()); // Ye line zaroori hai!
const connectDB = require("./src/db/db");
connectDB();

app.use('/api', authRoutes);       // Auth routes ke liye
app.use('/api/rides', rideRoutes); // 👈 Yeh line yahan add karein (Isse /api/rides/ ke saare endpoints active ho jayenge)

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
global.io = io;
const { sendPushNotification } = require('./firebase');
global.sendPushNotification = sendPushNotification;

// 🕒 3 Hours Before Tracking Rule Function (180 Minutes)
function isWithinThreeHours(scheduledTime) {
    if (!scheduledTime) return true;
    const now = new Date();
    const rideTime = new Date(scheduledTime);
    const diffInMinutes = (rideTime - now) / (1000 * 60);
    return diffInMinutes <= 180; // 👈 180 minutes (3 hours) ya usse kam bache ho toh true
}
// 🌐 SOCKET CONNECTION HANDLER
io.on('connection', (socket) => {
    socket.on('join_ride_room', ({ rideId, role, scheduledTime }) => {
        const roomName = `ride_${rideId}`;
        socket.join(roomName);
        const isTrackingAllowed = isWithinThreeHours(scheduledTime); // 👈 Function updated here
        console.log(`📌 ${role} joined ${roomName}. 3-Hour Tracking Active? ${isTrackingAllowed}`);
        io.to(roomName).emit('tracking_status_update', {
            isTrackingAllowed: isTrackingAllowed,
            message: isTrackingAllowed 
                ? "Live tracking activated!" 
                : "Live tracking will start 3 hours before scheduled time." // 👈 Message updated here
        });
    });
    // 🚗 Driver Location Broadcast to Passenger
    socket.on('driver_location_update', (data) => {
        const { rideId, latitude, longitude, heading } = data;
        const roomName = `ride_${rideId}`;
        socket.to(roomName).emit('passenger_receive_driver_location', {
            latitude,
            longitude,
            heading: heading || 0,
            timestamp: Date.now()
        });
    });

    // 🧍 Passenger Location Broadcast to Driver
    socket.on('passenger_location_update', (data) => {
        const { rideId, latitude, longitude } = data;
        const roomName = `ride_${rideId}`;
        socket.to(roomName).emit('driver_receive_passenger_location', {
            latitude,
            longitude,
            timestamp: Date.now()
        });
    });
// 💬 In-App Chat Messaging in Ride Room (Updated with DB Save)
    socket.on('send_message', async (data) => {
        const { rideId, senderId, senderName, message } = data;
        const roomName = `ride_${rideId}`;
        console.log(`💬 Chat in ${roomName} from ${senderName}: ${message}`);

        try {
            const Message = require('./src/models/Message');
            const newMessage = new Message({
                rideId,
                senderId,
                senderName,
                message
            });
            await newMessage.save(); // Database me save ho gaya

            io.to(roomName).emit('receive_message', {
                senderId,
                senderName,
                message,
                timestamp: newMessage.timestamp
            });
        } catch (err) {
            console.error("❌ Chat save error:", err.message);
        }
    });
    // 🕒 Cancellation Penalty & Refund Policy Calculator
function calculateCancellationFee(scheduledTime, cancelledAt = new Date()) {
    if (!scheduledTime) return { refundPercentage: 100, penaltyPercentage: 0 }; // Agar schedule time nahi hai toh full refund
    const rideTime = new Date(scheduledTime);
    const now = new Date(cancelledAt);
    const diffInHours = (rideTime - now) / (1000 * 60 * 60); // Ghante me difference
    if (diffInHours > 24) {
        // 24 ghante se zyada pehle: 10% penalty, 90% refund
        return { penaltyPercentage: 10, refundPercentage: 90 };
    } else if (diffInHours > 5 && diffInHours <= 24) {
        // 5 se 24 ghante ke beech: 20% penalty, 80% refund
        return { penaltyPercentage: 20, refundPercentage: 80 };
    } else if (diffInHours > 1 && diffInHours <= 5) {
        // 1 se 5 ghante ke beech: 50% penalty, 50% refund
        return { penaltyPercentage: 50, refundPercentage: 50 };
    } else {
        // 1 ghante ke andar ya ride ke baad: No refund (100% penalty)
        return { penaltyPercentage: 100, refundPercentage: 0 };
    }
}
// ❌ Ride Cancelled Event with Policy & Refund Logic
    socket.on('cancel_ride', (data) => {
        const { rideId, cancelledBy, scheduledTime, totalAmount } = data;
        const roomName = `ride_${rideId}`;

        // Policy ke hisab se calculation karo
        const policy = calculateCancellationFee(scheduledTime);
        const penaltyAmount = (totalAmount * policy.penaltyPercentage) / 100;
        const refundAmount = (totalAmount * policy.refundPercentage) / 100;

        console.log(`❌ Ride #${rideId} cancelled by ${cancelledBy}. Penalty: ${policy.penaltyPercentage}%, Refund: ${refundAmount}`);

        // Room ke sabhi users ko notification aur calculation bhejo
        io.to(roomName).emit('ride_cancelled_notification', {
            rideId: rideId,
            cancelledBy: cancelledBy, // 'passenger' ya 'driver'
            penaltyPercentage: policy.penaltyPercentage,
            refundAmount: refundAmount,
            message: cancelledBy == 'passenger' 
                ? `Ride cancelled by Passenger. Deducted: ${policy.penaltyPercentage}%, Refundable: ₹${refundAmount}` 
                : `Ride cancelled by Driver. Policy applied, Refundable: ₹${refundAmount}`
        });
    });
    // 🚀 Ride Started Event
    socket.on('start_ride', (data) => {
        const { rideId } = data;
        const roomName = `ride_${rideId}`;
        console.log(`🚀 Driver Started Ride for ${roomName}!`);
        io.to(roomName).emit('ride_started_stop_passenger_tracking', {
            rideId: rideId,
            message: "Ride started! Passenger location tracking turned off."
        });
    });

    // 🏁 Ride Completed/Ended Event
    socket.on('end_ride', (data) => {
        const { rideId } = data;
        const roomName = `ride_${rideId}`;
        console.log(`🏁 Ride #${rideId} ENDED by Driver!`);
        io.to(roomName).emit('ride_ended_navigate_to_summary', {
            rideId: rideId,
            message: "Ride Completed Successfully!"
        });
    });

    // ❌ Disconnect & Clean Database Socket ID
    socket.on('disconnect', async () => {
        console.log(`❌ Client Disconnected: ${socket.id}`);
        try {
            await User.updateMany({ socketId: socket.id }, { socketId: "" });
            await Driver.updateMany({ socketId: socket.id }, { socketId: "" });
            console.log(`🧹 Cleared socketId from DB for disconnected socket: ${socket.id}`);
        } catch (err) {
            console.error("❌ Error clearing socketId on disconnect:", err.message);
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});