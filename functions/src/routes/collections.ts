// ─── Collections Route / Callable ─────────────────────────────────────────────
// Endpoint for creating new shared collections and uploading key envelopes.
// ─────────────────────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
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

export const createCollection = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { name, description, ownerEnvelope } = data;

  if (!name || !ownerEnvelope) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: name, ownerEnvelope.'
    );
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
    });

    // 4. Audit logging
    await logAuditEvent(
      collectionId,
      actorUserId,
      'collection_created',
      `Created shared collection "${name}"`,
      { collection_name: name }
    );

    return { success: true, collectionId };
  } catch (err: any) {
    console.error('Error in createCollection:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to create collection');
  }
});
