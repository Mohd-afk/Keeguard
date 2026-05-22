"use strict";
// ─── Key Envelope Service ────────────────────────────────────────────────────
// Manages creation, retrieval, and deletion of wrapped collection keys.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotateKeyEnvelopes = exports.removeKeyEnvelopes = exports.setKeyEnvelope = void 0;
const admin = require("firebase-admin");
/**
 * Add or update a collection key envelope for a recipient.
 */
async function setKeyEnvelope(collectionId, recipientId, input) {
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
exports.setKeyEnvelope = setKeyEnvelope;
/**
 * Remove key envelopes for a recipient from a collection (e.g. on member removal).
 */
async function removeKeyEnvelopes(collectionId, recipientId) {
    const db = admin.firestore();
    const envelopeRef = db
        .collection('collections')
        .doc(collectionId)
        .collection('keyEnvelopes')
        .doc(recipientId);
    await envelopeRef.delete();
}
exports.removeKeyEnvelopes = removeKeyEnvelopes;
/**
 * Bulk upload key envelopes during a collection key rotation.
 */
async function rotateKeyEnvelopes(collectionId, newKeyVersion, envelopes) {
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
exports.rotateKeyEnvelopes = rotateKeyEnvelopes;
//# sourceMappingURL=cryptoEnvelopeService.js.map