const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true
    },
    pickupLocation: { type: String, required: true },
    dropLocation: { type: String, required: true },
    fromDistrict: { type: String, required: true },
    toDistrict: { type: String, required: true },
    departureTime: { type: Date, required: true }, 
    totalSeats: { type: Number, required: true },
    availableSeats: { type: Number, required: true }, 
    farePerSeat: { type: Number, required: true },
    
    // Ride ko book karne wale passengers ki list
    passengers: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        seatsBooked: { type: Number, default: 1 },
        status: { type: String, enum: ['pending', 'accepted', 'rejected', 'paid', 'cancelled'], default: 'pending' },
        otp: { type: String },
         exactPickup: { type: String, default: 'N/A' },
        
        // 💳 PAYMENT FIELDS
        paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        amountPaid: { type: Number, default: 0 },

        // 🟢 STEP 2 FINANCIAL TRACKING ADDED:
        platformCommission: { type: Number, default: 0 }, 
        driverEarning: { type: Number, default: 0 },      

        // 🟢 TIMELINE FIELD (Refund & Status tracking ke liye)
        timeline: [{
            status: { type: String },
            description: { type: String },
            timestamp: { type: Date, default: Date.now }
        }]
    }],
    
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled_by_passenger', 'cancelled_by_driver'],
        default: 'scheduled'
    }
}, { timestamps: true });

module.exports = mongoose.model('Ride', rideSchema);