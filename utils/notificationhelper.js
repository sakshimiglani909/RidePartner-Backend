const Notification = require('../models/Notification');
const User = require('../models/User');
const Driver = require('../models/Driver');

/**
 * Universal Notification Helper with Smart Routing (Socket vs FCM)
 * @param {String} targetId - User ya Driver ki MongoDB ID
 * @param {String} title - Notification Title
 * @param {String} body - Notification Message
 * @param {String} type - Notification Type 
 * @param {Boolean} forceFcmOnly - Agar true ho (jaise 30 min reminder), toh sirf FCM chalega
 */
const sendNotificationToUser = async (targetId, title, body, type = 'general', forceFcmOnly = false) => {
    try {
        // 1. Database mein notification record save karein
        const newNotif = new Notification({
            userId: targetId,
            title,
            body,
            type,
            isRead: false
        });
        await newNotif.save();

        // 2. Recipient ko User ya Driver collection se dhoondhein
        let recipient = await User.findById(targetId);
        if (!recipient) {
            recipient = await Driver.findById(targetId);
        }

        if (!recipient) {
            console.log(`⚠️ Notification target user/driver not found: ${targetId}`);
            return;
        }

      // 3. SMART ROUTING LOGIC:
        let notificationSentViaSocket = false;

        // Agar app open hai aur socketId registered hai (aur force FCM nahi manga gaya)
        if (!forceFcmOnly && global.io && recipient.socketId) {
            global.io.to(recipient.socketId).emit('new_notification', {
                title,
                body,
                type,
                createdAt: newNotif.createdAt
            });
            notificationSentViaSocket = true;
            console.log(`📡 Socket notification sent (Online User): ${targetId}`);
        }
        if (recipient.fcmToken && global.sendPushNotification) {
            // Agar aap chahte hain ki sirf tab FCM jaye jab user offline ho:
            // if (!notificationSentViaSocket) { ... } 
            
            // Ya fir direct FCM trigger karein background notifications ke liye:
            await global.sendPushNotification(recipient.fcmToken, title, body);
            console.log(`🔥 FCM Push notification sent: ${targetId}`);
        } else {
            console.log(`⚠️ No FCM token found for: ${targetId}`);
        }

    } catch (error) {
        console.error("❌ Error in sendNotificationToUser helper:", error.message);
    }
};

module.exports = sendNotificationToUser;