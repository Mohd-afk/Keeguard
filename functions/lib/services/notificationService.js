"use strict";
// ─── Notification Dispatch Service ───────────────────────────────────────────
// Creates user notifications inside the subcollection users/{uid}/notifications.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = void 0;
const admin = require("firebase-admin");
/**
 * Dispatch an in-app notification to a user's notification box.
 */
async function sendNotification(userId, payload) {
    try {
        const db = admin.firestore();
        const docRef = db.collection('users').doc(userId).collection('notifications').doc();
        await docRef.set({
            user_id: userId,
            status: 'pending',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            read_at: null,
            ...payload,
            metadata: payload.metadata || {},
        });
        return docRef.id;
    }
    catch (err) {
        console.error('Failed to dispatch notification', { userId, payload, err });
        throw new Error('NOTIFICATION_DISPATCH_FAILED');
    }
}
exports.sendNotification = sendNotification;
//# sourceMappingURL=notificationService.js.map