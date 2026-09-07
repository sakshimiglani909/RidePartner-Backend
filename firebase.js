

const {
  initializeApp,
  cert,
  getApps
} = require('firebase-admin/app');

const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('./serviceAccountKey.json');

try {
  if (getApps().length === 0) {
  initializeApp({
  credential: cert(serviceAccount)
});
  }

  console.log("🔥 Firebase Admin SDK initialized successfully!");
} catch (error) {
  console.log("❌ Firebase Init Error:", error.message);
}

const sendPushNotification = async (
  fcmToken,
  title,
  body,
  dataPayload = {}
) => {
  if (!fcmToken) return;

  try {
    if (getApps().length > 0) {
      const stringifiedData = {};

      if (dataPayload && typeof dataPayload === 'object') {
        Object.keys(dataPayload).forEach((key) => {
          stringifiedData[key] = String(dataPayload[key]);
        });
      }

      const message = {
        notification: {
          title,
          body
        },
        data: stringifiedData,
        token: fcmToken,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'high_importance_channel',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      };

      const response = await getMessaging().send(message);

      console.log(
        '✅ Notification sent successfully:',
        response
      );
    } else {
      console.log(
        '❌ Firebase initialize nahi hai, notification nahi bheja ja saka.'
      );
    }
  } catch (error) {
    console.error(
      '❌ Error sending notification:',
      error.message
    );
  }
};

module.exports = {
  sendPushNotification,
  admin: require('firebase-admin')
};