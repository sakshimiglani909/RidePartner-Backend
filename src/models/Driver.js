const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const driverSchema = new mongoose.Schema({
    // 🧑‍✈️ Driver Ki Personal Details
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true, trim: true },
    age: { type: Number },
    gender: { type: String },
    address: { type: String },
   // 💳 WALLET & EARNINGS
    walletBalance: { type: Number, default: 0 },    // Available payout balance
    pendingBalance: { type: Number, default: 0 },   // Locked earnings until ride completion
    penaltyDue: { type: Number, default: 0 },       // Cancellation penalties owed
    cancellationCount: { type: Number, default: 0 }, // Total cancellations tracked
    bankDetails: {
        accountNumber: { type: String, default: "" },
        ifscCode: { type: String, default: "" },
        accountHolderName: { type: String, default: "" },
    },

    // 🔔 NOTIFICATIONS & REALTIME TRACKING
    fcmToken: { type: String, default: "" },
    socketId: { type: String, default: "" },

    // ⭐️ RATING & REVIEWS
    rating: { type: Number, default: 5.0 },
    totalRatings: { type: Number, default: 0 },
    
   // 📸 REQUIRED PHOTOS ONLY
    avatar: { type: String, default: "" },       // Driver ki apni photo
    licensePhoto: { type: String, default: "" }, // License ki photo
    rcPhoto: { type: String, default: "" },      // RC (Vehicle) ki photo
    
    vehicleType: { 
        type: String, 
        enum: ['bike', 'scooty', 'car'], 
        required: true,
        lowercase: true, // 👈 Yeh ensure karega ki hamesha lowercase save ho
        trim: true       // 👈 Extra spaces hata dega
    },
    isAvailable: { type: Boolean, default: false },
    isVerified: { type: String, enum: ['pending', 'approved', 'rejected','blocked'], default: 'pending' }, 
    rejectionReason: { type: String, default: "" },
    rejectedFields: [{ type: String }], 
    
    isResubmitted: { type: Boolean, default: false },
    lastUpdatedDoc: { type: String, default: "" },
    currentLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
    }
}, { timestamps: true });

driverSchema.index({ currentLocation: '2dsphere' });

driverSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw new Error(error);
    }
});

driverSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.models.Driver || mongoose.model('Driver', driverSchema);