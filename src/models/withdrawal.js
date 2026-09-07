const mongoose = require('mongoose'); // 👈 Sabse zaroori line

const withdrawalSchema = new mongoose.Schema({
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    amount: { type: Number, required: true },
    upiId: { type: String, required: true },
    status: { type: String, default: 'Pending' }, 
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);