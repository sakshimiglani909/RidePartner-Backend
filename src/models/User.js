const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 1. Dhyan do yahan variable name 'userSchema' hona chahiye
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    avatar: { type: String, default: "" },
    role: { type: String, default: 'user' },
    
    // 🟢 YAHAN NAYI FIELDS ADD KAREIN:
    gender: { type: String, default: "Not Specified" },
    age: { type: Number, default: 0 },

    walletBalance: { type: Number, default: 0 },
    fcmToken: { type: String, default: "" },
    socketId: { type: String, default: "" },
    rating: { type: Number, default: 5.0 },
    totalRatings: { type: Number, default: 0 }
}, { timestamps: true });

// Pre-save hook
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw new Error(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// 2. Export wali line
module.exports = mongoose.models.User || mongoose.model("User", userSchema);