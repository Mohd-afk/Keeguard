// PURPOSE: Backend Cloud Function HTTP route handler for items endpoint.
// ─── Items Route / Callable ───────────────────────────────────────────────────
// Server-authoritative revision and commit handling for collection items.
// ─────────────────────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { verifyMemberAccess } from '../services/accessControlService';
import { logAuditEvent } from '../services/auditService';

function checkAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  return context.auth.uid;
}

export const commitItem = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const {
    collectionId,
    itemId,
    baseRevision,
    titleEnc,
    itemType,
    ciphertext,
    iv,
    authTag,
    itemKeyVersion,
    wrappedItemKey,
    isDelete,
    vaultItemId,
    ownerUserId,
  } = data;

  if (!collectionId || !itemId || baseRevision === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: collectionId, itemId, baseRevision.'
    );
  }

  const db = admin.firestore();

  // 1. Verify editor/manager/owner role
  await verifyMemberAccess(collectionId, actorUserId, ['owner', 'manager', 'editor']);

  const collectionRef = db.collection('collections').doc(collectionId);
  const itemRef = collectionRef.collection('items').doc(itemId);
  const syncEventsRef = collectionRef.collection('syncEvents');

  try {
    let result: any = null;

    await db.runTransaction(async (transaction) => {
      // 2. Fetch current collection revision
      const collSnap = await transaction.get(collectionRef);
      if (!collSnap.exists) {
        throw new Error('Collection does not exist');
      }

      const collData = collSnap.data()!;
      const currentRevision = collData.current_revision || 0;

      // 3. Revision check for conflict detection
      if (baseRevision < currentRevision) {
        result = {
          conflict: true,
          latestRevision: currentRevision,
          message: 'Conflict detected: your base revision is out of date. Please sync and resolve.',
        };
        return;
      }

      const newRevision = currentRevision + 1;
      const now = admin.firestore.FieldValue.serverTimestamp();

      // 4. Read item to check if it exists (for create vs update audit trail)
      const itemSnap = await transaction.get(itemRef);
      const exists = itemSnap.exists;

      // 5. Update or write item
      if (isDelete) {
        transaction.update(itemRef, {
          deleted_at: now,
          updated_by_user_id: actorUserId,
          updated_at: now,
          latest_revision: newRevision,
        });
      } else {
        const itemPayload: any = {
          owner_type: 'collection',
          owner_id: collectionId,
          title_enc: titleEnc,
          item_type: itemType || 'login',
          ciphertext,
          iv,
          auth_tag: authTag,
          item_key_version: itemKeyVersion || 1,
          wrapped_item_key: wrappedItemKey,
          latest_revision: newRevision,
          updated_by_user_id: actorUserId,
          updated_at: now,
          deleted_at: null,
        };

        if (vaultItemId) itemPayload.vault_item_id = vaultItemId;
        if (ownerUserId) itemPayload.owner_user_id = ownerUserId;

        if (!exists) {
          itemPayload.created_by_user_id = actorUserId;
          itemPayload.created_at = now;
          itemPayload.base_revision = baseRevision;
        }

        transaction.set(itemRef, itemPayload, { merge: true });
      }

      // 6. Update collection revision
      transaction.update(collectionRef, {
        current_revision: newRevision,
        updated_at: now,
      });

      // 7. Emit SyncEvent for realtime updates
      const eventDoc = syncEventsRef.doc();
      transaction.set(eventDoc, {
        scope_type: 'collection',
        scope_id: collectionId,
        event_type: isDelete ? 'item_deleted' : (exists ? 'item_updated' : 'item_created'),
        revision: newRevision,
        payload: {
          item_id: itemId,
          updated_by: actorUserId,
          event_time: Date.now(),
        },
        created_at: now,
      });

      result = {
        success: true,
        newRevision,
      };
    });

    if (result.success) {
      // 8. Audit log outside the transaction (non-blocking)
      await logAuditEvent(
        collectionId,
        actorUserId,
        isDelete ? 'item_deleted' : 'item_committed',
        isDelete ? `Deleted item ${itemId}` : `Committed item ${itemId}`,
        { item_id: itemId }
      );
    }

    return result;
  } catch (err: any) {
    console.error('Error in commitItem:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to commit item');
  }
});
