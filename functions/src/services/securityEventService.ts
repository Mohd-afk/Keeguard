// ─── Security Event Logging Service ──────────────────────────────────────────
// Handles logging high-risk security alerts, intrusion detection, and anomalies.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

/**
 * Log a high-severity security event or potential abuse incident.
 */
export async function logSecurityEvent(
  userId: string,
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const db = admin.firestore();
    await db.collection('securityEvents').add({
      user_id: userId,
      event_type: eventType,
      severity,
      details,
      metadata,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write security event', { userId, eventType, severity, err });
  }
}
