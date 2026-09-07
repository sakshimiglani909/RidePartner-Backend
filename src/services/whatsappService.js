const twilio = require('twilio');
const WhatsAppLog = require('../models/WhatsAppLog');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+17372212163'; // Sandbox default

const client = twilio(accountSid, authToken);

exports.sendWhatsAppNotification = async (driverId, phone, messageText) => {
    // Format phone number for Twilio WhatsApp (e.g., whatsapp:+919876543210)
    let formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    if (!formattedPhone.startsWith('whatsapp:')) {
        formattedPhone = `whatsapp:${formattedPhone}`;
    }

    // Pehle log create karein
    const logEntry = new WhatsAppLog({
        driver: driverId,
        phone: phone,
        message: messageText,
        status: 'queued'
    });
    await logEntry.save();

    try {
        const message = await client.messages.create({
            from: twilioNumber,
            to: formattedPhone,
            body: messageText
        });

        // Agar success hua
        logEntry.twilioSid = message.sid;
        logEntry.status = 'sent';
        await logEntry.save();
        return { success: true, sid: message.sid };
    } catch (error) {
        // Agar fail hua
        logEntry.status = 'failed';
        logEntry.errorMessage = error.message;
        await logEntry.save();
        console.log("❌ Twilio WhatsApp Error:", error.message);
        return { success: false, error: error.message };
    }
};