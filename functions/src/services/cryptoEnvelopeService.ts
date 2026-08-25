// PURPOSE: Backend Cloud Function service handling cryptoEnvelopeService logic.
// ─── Key Envelope Service ────────────────────────────────────────────────────
// Manages creation, retrieval, and deletion of wrapped collection keys.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

export interface EnvelopeInput {
  collection_key_version: number;
  recipient_type: 'user' | 'device';
  recipient_id: string;
  wrapped_collection_key: string;
  sender_public_key_b64: string;
}

/**
 * Add or update a collection key envelope for a recipient.
 */
export async function setKeyEnvelope(
  collectionId: string,
  recipientId: string,
  input: EnvelopeInput
): Promise<void> {
  const db = admin.firestore();
  const envelopeRef = db
    .collection('collections')
    .doc(collectionId)
    .collection('keyEnvelopes')
    .doc(recipientId);

  await envelopeRef.set({
    collection_id: collectionId,
    ...input,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Remove key envelopes for a recipient from a collection (e.g. on member removal).
 */
export async function removeKeyEnvelopes(
  collectionId: string,
  recipientId: string
): Promise<void> {
  const db = admin.firestore();
  const envelopeRef = db
    .collection('collections')
    .doc(collectionId)
    .collection('keyEnvelopes')
    .doc(recipientId);

  await envelopeRef.delete();
}

/**
 * Bulk upload key envelopes during a collection key rotation.
 */
export async function rotateKeyEnvelopes(
  collectionId: string,
  newKeyVersion: number,
  envelopes: Array<{
    recipientId: string;
    wrappedKey: string;
    senderPublicKeyB64: string;
  }>
): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();

  envelopes.forEach((env) => {
    const envelopeRef = db
      .collection('collections')
      .doc(collectionId)
      .collection('keyEnvelopes')
      .doc(env.recipientId);

    batch.set(envelopeRef, {
      collection_id: collectionId,
      collection_key_version: newKeyVersion,
      recipient_type: 'user',
      recipient_id: env.recipientId,
      wrapped_collection_key: env.wrappedKey,
      sender_public_key_b64: env.senderPublicKeyB64,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}
