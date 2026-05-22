"use strict";
// ─── Firestore Background Triggers ───────────────────────────────────────────
// Automates security events, key version increments, and envelope invalidations.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewDeviceRegistered = exports.onMemberRemoved = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const securityEventService_1 = require("../services/securityEventService");
const notificationService_1 = require("../services/notificationService");
/**
 * Triggered when a collection member is updated.
 * Handles access revocation (key envelope deletion, key version increment).
 */
exports.onMemberRemoved = functions.firestore
    .document('collections/{collectionId}/members/{userId}')
    .onUpdate(async (change, context) => {
    const { collectionId, userId } = context.params;
    const before = change.before.data();
    const after = change.after.data();
    // Verify status transitioned from active to removed
    if (before.status === 'active' && after.status === 'removed') {
        console.log(`onMemberRemoved trigger fired: User ${userId} removed from Collection ${collectionId}`);
        const db = admin.firestore();
        // 1. Invalidate/delete key envelope for removed user
        const envelopeRef = db
            .collection('collections')
            .doc(collectionId)
            .collection('keyEnvelopes')
            .doc(userId);
        await envelopeRef.delete();
        console.log(`Key envelope deleted for removed user ${userId}`);
        // 2. Increment current_key_version and current_revision
        const collectionRef = db.collection('collections').doc(collectionId);
        await db.runTransaction(async (transaction) => {
            const cSnap = await transaction.get(collectionRef);
            if (!cSnap.exists)
                return;
            const cData = cSnap.data();
            const nextKeyVersion = (cData.current_key_version || 1) + 1;
            const nextRevision = (cData.current_revision || 0) + 1;
            transaction.update(collectionRef, {
                current_key_version: nextKeyVersion,
                current_revision: nextRevision,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            // 3. Emit access_revoked SyncEvent so client knows to rotate keys
            const eventDoc = db.collection('collections').doc(collectionId).collection('syncEvents').doc();
            transaction.set(eventDoc, {
                scope_type: 'collection',
                scope_id: collectionId,
                event_type: 'access_revoked',
                revision: nextRevision,
                payload: {
                    user_id: userId,
                    next_key_version: nextKeyVersion,
                },
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        // 4. Send notification to the removed member
        const collSnap = await db.collection('collections').doc(collectionId).get();
        const collName = collSnap.exists ? collSnap.data().name : 'Shared Collection';
        await (0, notificationService_1.sendNotification)(userId, {
            type: 'member_removed',
            priority: 'high',
            type_category: 'collaboration',
            title: 'Access Revoked',
            body: `Your access to the shared collection "${collName}" has been revoked.`,
            metadata: {
                collection_id: collectionId,
            },
        });
        console.log(`onMemberRemoved trigger completed successfully for user ${userId}`);
    }
});
/**
 * Triggered when a new device is registered on a user's account.
 * Logs a security event and dispatches an urgent security notification.
 */
exports.onNewDeviceRegistered = functions.firestore
    .document('users/{userId}/devices/{deviceId}')
    .onCreate(async (snap, context) => {
    const { userId, deviceId } = context.params;
    const deviceData = snap.data();
    const deviceName = deviceData.device_name || deviceData.name || 'Unknown Device';
    console.log(`onNewDeviceRegistered trigger fired for User ${userId}, Device ${deviceId}`);
    // 1. Log security event
    await (0, securityEventService_1.logSecurityEvent)(userId, 'new_device_registered', 'medium', `New device registered: ${deviceName}`, { device_id: deviceId, device_name: deviceName });
    // 2. Dispatch urgent in-app notification
    await (0, notificationService_1.sendNotification)(userId, {
        type: 'security_alert',
        priority: 'urgent',
        type_category: 'security',
        title: 'New Device Registered',
        body: `A new device "${deviceName}" was registered to your account. If this wasn't you, revoke its session immediately.`,
        metadata: {
            device_id: deviceId,
        },
    });
    console.log(`onNewDeviceRegistered trigger completed successfully`);
});
//# sourceMappingURL=triggers.js.map