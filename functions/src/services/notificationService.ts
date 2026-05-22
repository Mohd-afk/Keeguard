// ─── Notification Dispatch Service ───────────────────────────────────────────
// Creates user notifications inside the subcollection users/{uid}/notifications.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

interface SendNotificationPayload {
  type: 'invite_received' | 'invite_accepted' | 'member_removed' | 'security_alert' | 'system';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type_category: 'collaboration' | 'security' | 'system';
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

/**
 * Dispatch an in-app notification to a user's notification box.
 */
export async function sendNotification(
  userId: string,
  payload: SendNotificationPayload
): Promise<string> {
  try {
    const db = admin.firestore();
    const docRef = db.collection('users').doc(userId).collection('notifications').doc();
    
    await docRef.set({
      user_id: userId,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      read_at: null,
      ...payload,
      metadata: payload.metadata || {},
    });

    return docRef.id;
  } catch (err) {
    console.error('Failed to dispatch notification', { userId, payload, err });
    throw new Error('NOTIFICATION_DISPATCH_FAILED');
  }
}
