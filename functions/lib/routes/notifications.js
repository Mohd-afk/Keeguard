"use strict";
// ─── Notifications Route / Callables ──────────────────────────────────────────
// Endpoints for managing notification read status.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.markNotificationRead = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
function checkAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    return context.auth.uid;
}
exports.markNotificationRead = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { notificationId } = data;
    if (!notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required argument: notificationId.');
    }
    const db = admin.firestore();
    const ref = db.collection('users').doc(actorUserId).collection('notifications').doc(notificationId);
    try {
        const snap = await ref.get();
        if (!snap.exists) {
            throw new functions.https.HttpsError('not-found', 'Notification not found');
        }
        await ref.update({
            status: 'read',
            read_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (err) {
        console.error('Error in markNotificationRead:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to mark read');
    }
});
//# sourceMappingURL=notifications.js.map