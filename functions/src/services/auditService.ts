// ─── Audit Logging Service ───────────────────────────────────────────────────
// Handles logging of non-repudiable audit events for sensitive collection operations.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

/**
 * Log a shared collection audit event in Firestore.
 */
export async function logAuditEvent(
  collectionId: string,
  actorUserId: string,
  eventType: string,
  details: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const db = admin.firestore();
    await db.collection('auditEvents').add({
      collection_id: collectionId,
      actor_user_id: actorUserId,
      event_type: eventType,
      details,
      metadata,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write audit log event', { collectionId, actorUserId, eventType, err });
  }
}
