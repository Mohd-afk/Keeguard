"use strict";
// ─── Collections Route / Callable ─────────────────────────────────────────────
// Endpoint for creating new shared collections and uploading key envelopes.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferCollectionOwnership = exports.submitRotatedKeys = exports.createCollection = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const auditService_1 = require("../services/auditService");
const accessControlService_1 = require("../services/accessControlService");
function checkAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    return context.auth.uid;
}
exports.createCollection = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { name, description, ownerEnvelope } = data;
    if (!name || !ownerEnvelope) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: name, ownerEnvelope.');
    }
    const db = admin.firestore();
    try {
        const collRef = db.collection('collections').doc();
        const collectionId = collRef.id;
        const now = admin.firestore.FieldValue.serverTimestamp();
        // Run creation atomically inside a transaction
        await db.runTransaction(async (transaction) => {
            // 1. Create collection doc
            transaction.set(collRef, {
                owner_user_id: actorUserId,
                name: name.trim(),
                description: description ? description.trim() : null,
                visibility: 'shared',
                status: 'active',
                current_key_version: 1,
                current_revision: 0,
                created_at: now,
                updated_at: now,
            });
            // 2. Add owner as active member
            const memberRef = collRef.collection('members').doc(actorUserId);
            transaction.set(memberRef, {
                collection_id: collectionId,
                user_id: actorUserId,
                role: 'owner',
                status: 'active',
                joined_at: now,
                added_by_user_id: actorUserId,
                created_at: now,
                updated_at: now,
            });
            // 3. Write key envelope for owner
            const envelopeRef = collRef.collection('keyEnvelopes').doc(actorUserId);
            transaction.set(envelopeRef, {
                collection_id: collectionId,
                collection_key_version: 1,
                recipient_type: 'user',
                recipient_id: actorUserId,
                wrapped_collection_key: ownerEnvelope.wrappedKey,
                sender_public_key_b64: ownerEnvelope.senderPublicKeyB64,
                created_at: now,
            });
            // 4. Write to folder_shares collection
            const folderShareRef = db.collection('folder_shares').doc(`${collectionId}_${actorUserId}`);
            transaction.set(folderShareRef, {
                folder_id: collectionId,
                user_id: actorUserId,
                role: 'collaborator',
                status: 'accepted',
                updated_at: now,
            });
        });
        // 4. Audit logging
        await (0, auditService_1.logAuditEvent)(collectionId, actorUserId, 'collection_created', `Created shared collection "${name}"`, { collection_name: name });
        return { success: true, collectionId };
    }
    catch (err) {
        console.error('Error in createCollection:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to create collection');
    }
});
exports.submitRotatedKeys = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, newKeyVersion, envelopes, items } = data;
    if (!collectionId || !newKeyVersion || !envelopes || !items) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, newKeyVersion, envelopes, items.');
    }
    const db = admin.firestore();
    // 1. Verify caller has owner/manager role
    await (0, accessControlService_1.verifyMemberAccess)(collectionId, actorUserId, ['owner', 'manager']);
    try {
        const collectionRef = db.collection('collections').doc(collectionId);
        await db.runTransaction(async (transaction) => {
            // 2. Fetch current collection to verify version
            const cSnap = await transaction.get(collectionRef);
            if (!cSnap.exists) {
                throw new Error('Collection does not exist');
            }
            const cData = cSnap.data();
            // Update key version and revision
            const nextRevision = (cData.current_revision || 0) + 1;
            transaction.update(collectionRef, {
                current_key_version: newKeyVersion,
                current_revision: nextRevision,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            // 3. Update items with re-wrapped keys
            for (const item of items) {
                const itemRef = collectionRef.collection('items').doc(item.itemId);
                transaction.update(itemRef, {
                    wrapped_item_key: item.wrappedItemKey,
                    collection_key_version: newKeyVersion,
                    latest_revision: nextRevision,
                    updated_by_user_id: actorUserId,
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            // 4. Emit key_rotated SyncEvent
            const eventDoc = collectionRef.collection('syncEvents').doc();
            transaction.set(eventDoc, {
                scope_type: 'collection',
                scope_id: collectionId,
                event_type: 'key_rotated',
                revision: nextRevision,
                payload: {
                    new_key_version: newKeyVersion,
                    updated_by: actorUserId,
                },
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        // 5. Bulk upload new key envelopes
        const { rotateKeyEnvelopes } = await Promise.resolve().then(() => require('../services/cryptoEnvelopeService'));
        await rotateKeyEnvelopes(collectionId, newKeyVersion, envelopes);
        // 6. Audit logging
        await (0, auditService_1.logAuditEvent)(collectionId, actorUserId, 'key_rotated', `Rotated collection key to version ${newKeyVersion}`, { key_version: newKeyVersion });
        return { success: true };
    }
    catch (err) {
        console.error('Error in submitRotatedKeys:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to rotate keys');
    }
});
exports.transferCollectionOwnership = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, targetUserId } = data;
    if (!collectionId || !targetUserId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, targetUserId.');
    }
    const db = admin.firestore();
    try {
        const collectionRef = db.collection('collections').doc(collectionId);
        await db.runTransaction(async (transaction) => {
            // 1. Fetch collection doc
            const collSnap = await transaction.get(collectionRef);
            if (!collSnap.exists) {
                throw new Error('Collection does not exist');
            }
            const collData = collSnap.data();
            if (collData.owner_user_id !== actorUserId) {
                throw new Error('PERMISSION_DENIED: Only the current owner can transfer ownership');
            }
            // 2. Fetch actor membership
            const actorMemberRef = collectionRef.collection('members').doc(actorUserId);
            const actorMemberSnap = await transaction.get(actorMemberRef);
            if (!actorMemberSnap.exists || actorMemberSnap.data().role !== 'owner') {
                throw new Error('PERMISSION_DENIED: Caller must have owner role to transfer ownership');
            }
            // 3. Fetch target membership
            const targetMemberRef = collectionRef.collection('members').doc(targetUserId);
            const targetMemberSnap = await transaction.get(targetMemberRef);
            if (!targetMemberSnap.exists) {
                throw new Error('NOT_FOUND: Target member does not exist');
            }
            const targetData = targetMemberSnap.data();
            if (targetData.status !== 'active') {
                throw new Error('FAILED_PRECONDITION: Target member is not an active collaborator');
            }
            if (targetData.role !== 'manager') {
                throw new Error('FAILED_PRECONDITION: Target member must be upgraded to Manager before transferring ownership');
            }
            // 4. Update roles atomically
            transaction.update(collectionRef, {
                owner_user_id: targetUserId,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(actorMemberRef, {
                role: 'manager',
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(targetMemberRef, {
                role: 'owner',
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            // 5. Emit SyncEvent for both role changes
            const nextRevision = (collData.current_revision || 0) + 1;
            transaction.update(collectionRef, {
                current_revision: nextRevision,
            });
            const eventDoc1 = collectionRef.collection('syncEvents').doc();
            transaction.set(eventDoc1, {
                scope_type: 'collection',
                scope_id: collectionId,
                event_type: 'ownership_transferred',
                revision: nextRevision,
                payload: {
                    previous_owner: actorUserId,
                    new_owner: targetUserId,
                },
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        // 6. Notify new owner
        const collSnap = await db.collection('collections').doc(collectionId).get();
        const collName = collSnap.data().name;
        const { sendNotification } = await Promise.resolve().then(() => require('../services/notificationService'));
        await sendNotification(targetUserId, {
            type: 'system',
            priority: 'high',
            type_category: 'collaboration',
            title: 'Ownership Transferred',
            body: `You are now the Owner of the shared collection "${collName}".`,
            metadata: {
                collection_id: collectionId,
            },
        });
        // 7. Log audit event
        await (0, auditService_1.logAuditEvent)(collectionId, actorUserId, 'ownership_transferred', `Transferred collection ownership to user ${targetUserId}`, { target_user_id: targetUserId });
        return { success: true };
    }
    catch (err) {
        console.error('Error in transferCollectionOwnership:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to transfer ownership');
    }
});
//# sourceMappingURL=collections.js.map