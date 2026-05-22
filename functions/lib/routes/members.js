"use strict";
// ─── Members Route / Callables ────────────────────────────────────────────────
// Endpoints for updating roles and removing members.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeMember = exports.updateMemberRole = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const accessControlService_1 = require("../services/accessControlService");
const auditService_1 = require("../services/auditService");
const notificationService_1 = require("../services/notificationService");
function checkAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    return context.auth.uid;
}
exports.updateMemberRole = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, targetUserId, newRole } = data;
    if (!collectionId || !targetUserId || !newRole) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, targetUserId, newRole.');
    }
    const db = admin.firestore();
    try {
        // 1. Enforce hierarchy check
        await (0, accessControlService_1.canModifyMember)(collectionId, actorUserId, targetUserId);
        // 2. Additional hierarchy check: actor cannot promote someone to their own level or higher
        const actorRole = await (0, accessControlService_1.verifyMemberAccess)(collectionId, actorUserId, ['owner', 'manager']);
        if (newRole === 'owner') {
            throw new Error('PERMISSION_DENIED: Ownership cannot be transferred via updateMemberRole');
        }
        if (!(0, accessControlService_1.hasHigherAuthority)(actorRole, newRole)) {
            throw new Error(`PERMISSION_DENIED: You cannot promote someone to equal or higher authority (${actorRole} to ${newRole})`);
        }
        const memberRef = db
            .collection('collections')
            .doc(collectionId)
            .collection('members')
            .doc(targetUserId);
        await memberRef.update({
            role: newRole,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 3. Write sync event
        const collectionRef = db.collection('collections').doc(collectionId);
        let currentRevision = 0;
        await db.runTransaction(async (transaction) => {
            const cSnap = await transaction.get(collectionRef);
            currentRevision = (cSnap.data()?.current_revision || 0) + 1;
            transaction.update(collectionRef, {
                current_revision: currentRevision,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            const eventDoc = db.collection('collections').doc(collectionId).collection('syncEvents').doc();
            transaction.set(eventDoc, {
                scope_type: 'collection',
                scope_id: collectionId,
                event_type: 'member_updated',
                revision: currentRevision,
                payload: {
                    user_id: targetUserId,
                    role: newRole,
                },
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        // 4. Notify member
        const collSnap = await db.collection('collections').doc(collectionId).get();
        const collName = collSnap.data().name;
        await (0, notificationService_1.sendNotification)(targetUserId, {
            type: 'system',
            priority: 'medium',
            type_category: 'collaboration',
            title: 'Role Updated',
            body: `Your role in the collection "${collName}" was updated to ${newRole}.`,
            metadata: {
                collection_id: collectionId,
            },
        });
        // 5. Audit log
        await (0, auditService_1.logAuditEvent)(collectionId, actorUserId, 'member_role_updated', `Updated member ${targetUserId} role to ${newRole}`, { target_user_id: targetUserId, new_role: newRole });
        return { success: true };
    }
    catch (err) {
        console.error('Error in updateMemberRole:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to update member role');
    }
});
exports.removeMember = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, targetUserId } = data;
    if (!collectionId || !targetUserId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, targetUserId.');
    }
    const db = admin.firestore();
    try {
        // 1. Enforce hierarchy check
        await (0, accessControlService_1.canModifyMember)(collectionId, actorUserId, targetUserId);
        const memberRef = db
            .collection('collections')
            .doc(collectionId)
            .collection('members')
            .doc(targetUserId);
        // Set membership status to 'removed' instead of deleting to keep audit trails intact
        await memberRef.update({
            status: 'removed',
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 2. Audit log
        await (0, auditService_1.logAuditEvent)(collectionId, actorUserId, actorUserId === targetUserId ? 'member_left' : 'member_removed', actorUserId === targetUserId ? `Member left the collection` : `Removed member ${targetUserId}`, { target_user_id: targetUserId });
        return { success: true };
    }
    catch (err) {
        console.error('Error in removeMember:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to remove member');
    }
});
//# sourceMappingURL=members.js.map