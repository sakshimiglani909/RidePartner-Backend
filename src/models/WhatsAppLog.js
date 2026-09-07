const mongoose = require('mongoose');
const whatsAppLogSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    twilioSid: { type: String },
    status: { type: String, enum: ['sent', 'delivered', 'failed', 'queued'], default: 'queued' },
    errorMessage: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.models.WhatsAppLog || mongoose.model('WhatsAppLog', whatsAppLogSchema);