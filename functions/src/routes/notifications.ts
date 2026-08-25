// PURPOSE: Backend Cloud Function HTTP route handler for notifications endpoint.
// ─── Notifications Route / Callables ──────────────────────────────────────────
// Endpoints for managing notification read status.
// ─────────────────────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { acceptCollectionInvite, declineCollectionInvite } from '../services/inviteService';

function checkAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  return context.auth.uid;
}

export const markNotificationRead = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { notificationId } = data;

  if (!notificationId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required argument: notificationId.'
    );
  }

  const db = admin.firestore();
  const ref = db.collection('users').doc(actorUserId).collection('notifications').doc(notificationId);

  try {
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Notification not found');
    }

    await ref.update({
      status: 'read',
      read_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error in markNotificationRead:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to mark read');
  }
});

/**
 * Accepts or declines a folder share invite and marks the notification as read.
 */
export const respondToShareRequest = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { notificationId, accept } = data;

  if (!notificationId || accept === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: notificationId, accept.'
    );
  }

  const db = admin.firestore();
  const notificationRef = db
    .collection('users')
    .doc(actorUserId)
    .collection('notifications')
    .doc(notificationId);

  try {
    const notifSnap = await notificationRef.get();
    if (!notifSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Notification not found');
    }

    const notifData = notifSnap.data()!;
    const metadata = notifData.metadata || {};
    const collectionId = metadata.collection_id;
    const inviteId = metadata.invite_id;

    if (!collectionId || !inviteId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Notification does not contain collection_id or invite_id metadata.'
      );
    }

    // Process accept or decline
    if (accept) {
      await acceptCollectionInvite(collectionId, actorUserId, inviteId);
    } else {
      await declineCollectionInvite(collectionId, actorUserId, inviteId);
    }

    // Mark read
    await notificationRef.update({
      status: 'read',
      read_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error in respondToShareRequest:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to respond to share request');
  }
});
