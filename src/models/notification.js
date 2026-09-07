const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true }, // User ya Driver ki ID
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, default: 'general' }, // e.g., 'admin_notice', 'ride_update', 'wallet'
    isRead: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);