const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
try {
  const serviceAccount = require(path.resolve(__dirname, './serviceAccountKey.json'));
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount) // Direct cert function call
    });
  }
  console.log("🔥 Firebase Admin SDK initialized successfully!");
} catch (error) {
  console.log("❌ Firebase Init Error:", error.message);
}
// 🟢 FIX: dataPayload optional parameter add kiya
const sendPushNotification = async (fcmToken, title, body, dataPayload = {}) => {
  if (!fcmToken) return;

  try {
    if (getApps().length > 0) {
      // 🟢 Payload ki saari values ko explicitly String me convert karein
      const stringifiedData = {};
      if (dataPayload && typeof dataPayload === 'object') {
        Object.keys(dataPayload).forEach((key) => {
          stringifiedData[key] = String(dataPayload[key]);
        });
      }

      const message = {
        notification: { title, body },
        data: stringifiedData, // 👈 Safe stringified data object pass kiya
        token: fcmToken,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'high_importance_channel',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK' // 👈 Android deep-linking trigger
          }
        }
      };
      const response = await getMessaging().send(message);
      console.log('✅ Notification sent successfully:', response);
    } else {
      console.log('❌ Firebase initialize nahi hai, notification nahi bheja ja saka.');
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
  }
};
module.exports = { sendPushNotification, admin: require('firebase-admin') };