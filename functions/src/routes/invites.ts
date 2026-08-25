// PURPOSE: Backend Cloud Function HTTP route handler for invites endpoint.
// ─── Invites Route / Callables ────────────────────────────────────────────────
// Endpoints for sending, accepting, declining, and revoking invites.
// ─────────────────────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import {
  createCollectionInvite,
  acceptCollectionInvite,
  declineCollectionInvite,
  revokeCollectionInvite,
} from '../services/inviteService';

function checkAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  return context.auth.uid;
}

export const createInvite = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { collectionId, targetUsername, role, message, recipientEnvelope } = data;

  if (!collectionId || !targetUsername || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: collectionId, targetUsername, role.'
    );
  }

  try {
    const inviteId = await createCollectionInvite(
      collectionId,
      actorUserId,
      targetUsername,
      role,
      message || null,
      recipientEnvelope
    );
    return { success: true, inviteId };
  } catch (err: any) {
    console.error('Error in createInvite:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to create invite');
  }
});

export const acceptInvite = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { collectionId, inviteId } = data;

  if (!collectionId || !inviteId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: collectionId, inviteId.'
    );
  }

  try {
    await acceptCollectionInvite(collectionId, actorUserId, inviteId);
    return { success: true };
  } catch (err: any) {
    console.error('Error in acceptInvite:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to accept invite');
  }
});

export const declineInvite = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { collectionId, inviteId } = data;

  if (!collectionId || !inviteId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: collectionId, inviteId.'
    );
  }

  try {
    await declineCollectionInvite(collectionId, actorUserId, inviteId);
    return { success: true };
  } catch (err: any) {
    console.error('Error in declineInvite:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to decline invite');
  }
});

export const revokeInvite = functions.https.onCall(async (data, context) => {
  const actorUserId = checkAuth(context);
  const { collectionId, inviteId } = data;

  if (!collectionId || !inviteId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required arguments: collectionId, inviteId.'
    );
  }

  try {
    await revokeCollectionInvite(collectionId, actorUserId, inviteId);
    return { success: true };
  } catch (err: any) {
    console.error('Error in revokeInvite:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to revoke invite');
  }
});
