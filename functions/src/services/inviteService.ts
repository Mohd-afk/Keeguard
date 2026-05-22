// ─── Invite Management Service ────────────────────────────────────────────────
// Orchestrates invite creation, acceptance, declination, and revocation.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';
import { verifyMemberAccess } from './accessControlService';
import { sendNotification } from './notificationService';
import { logAuditEvent } from './auditService';
import { logSecurityEvent } from './securityEventService';
import { checkRateLimit } from './rateLimitService';
import { CollectionInvite, CollectionRole } from '../models/types';

/**
 * Create a new collection invite.
 */
export async function createCollectionInvite(
  collectionId: string,
  actorUserId: string,
  targetUsername: string,
  role: Exclude<CollectionRole, 'owner'>,
  message: string | null
): Promise<string> {
  const db = admin.firestore();

  // 1. Verify actor has manager/owner permissions
  await verifyMemberAccess(collectionId, actorUserId, ['owner', 'manager']);

  // 2. Resolve target username to UID
  const cleanUsername = targetUsername.trim().toLowerCase().replace(/^@/, '');
  const usernameSnap = await db.collection('usernames').doc(cleanUsername).get();
  
  if (!usernameSnap.exists) {
    throw new Error('NOT_FOUND: User does not exist');
  }

  const invitedUserId = usernameSnap.data()!.uid;

  if (invitedUserId === actorUserId) {
    throw new Error('FAILED_PRECONDITION: You cannot invite yourself');
  }

  // 3. Rate limiting (Spam detection: limit to 10 invites per hour per user)
  await checkRateLimit(`createInvite_${actorUserId}`, {
    limit: 10,
    windowMs: 3600000,
    errorMessage: 'Too many invites sent. Please try again in an hour.',
  });

  // 4. Cooldown check (block invite if revoked/declined recently within 10 mins)
  const cooldownId = `${actorUserId}_${collectionId}_${invitedUserId}`;
  const cooldownSnap = await db.collection('cooldowns').doc(cooldownId).get();
  if (cooldownSnap.exists) {
    const cooldownData = cooldownSnap.data()!;
    if (Date.now() - cooldownData.createdAt < 600000) {
      throw new Error('FAILED_PRECONDITION: User was recently invited. Please wait a few minutes before inviting them again.');
    }
  }

  // 5. Verify target is not already a member
  const memberSnap = await db
    .collection('collections')
    .doc(collectionId)
    .collection('members')
    .doc(invitedUserId)
    .get();

  if (memberSnap.exists && memberSnap.data()!.status === 'active') {
    throw new Error('FAILED_PRECONDITION: User is already an active member of this collection');
  }

  // 6. Verify target does not already have a pending invite
  const invitesQuery = await db
    .collection('collections')
    .doc(collectionId)
    .collection('invites')
    .where('invited_user_id', '==', invitedUserId)
    .where('status', '==', 'pending')
    .get();

  if (!invitesQuery.empty) {
    throw new Error('FAILED_PRECONDITION: A pending invite already exists for this user');
  }

  // 7. Get Collection & Actor display details for notification
  const collSnap = await db.collection('collections').doc(collectionId).get();
  const collName = collSnap.data()!.name;

  const actorProfileSnap = await db.collection('users').doc(actorUserId).collection('data').doc('profile').get();
  const actorUsername = actorProfileSnap.exists ? actorProfileSnap.data()!.username : 'Unknown';
  const actorDisplayName = actorProfileSnap.exists ? actorProfileSnap.data()!.displayName || actorUsername : actorUsername;

  // 8. Create the invite record
  const invitesColl = db.collection('collections').doc(collectionId).collection('invites');
  const inviteDoc = invitesColl.doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48 hour expiry

  const invitePayload: Omit<CollectionInvite, 'id'> = {
    collection_id: collectionId,
    invited_user_id: invitedUserId,
    invited_by_user_id: actorUserId,
    role,
    status: 'pending',
    message,
    expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
    created_at: now,
    responded_at: null,
  };

  await inviteDoc.set(invitePayload);

  // 9. Dispatch in-app notification
  await sendNotification(invitedUserId, {
    type: 'invite_received',
    priority: 'high',
    type_category: 'collaboration',
    title: 'Shared Collection Invite',
    body: `${actorDisplayName} (@${actorUsername}) invited you to join the collection "${collName}" as a ${role}.`,
    metadata: {
      collection_id: collectionId,
      collection_name: collName,
      invite_id: inviteDoc.id,
      inviter_user_id: actorUserId,
      inviter_username: actorUsername,
      inviter_display_name: actorDisplayName,
    },
  });

  // 10. Audit logging
  await logAuditEvent(
    collectionId,
    actorUserId,
    'invite_created',
    `Invited ${targetUsername} as ${role}`,
    { invite_id: inviteDoc.id, invited_user_id: invitedUserId }
  );

  return inviteDoc.id;
}

/**
 * Revoke a collection invite.
 */
export async function revokeCollectionInvite(
  collectionId: string,
  actorUserId: string,
  inviteId: string
): Promise<void> {
  const db = admin.firestore();
  const inviteRef = db.collection('collections').doc(collectionId).collection('invites').doc(inviteId);
  const snap = await inviteRef.get();

  if (!snap.exists) {
    throw new Error('NOT_FOUND: Invite does not exist');
  }

  const inviteData = snap.data()! as CollectionInvite;
  if (inviteData.status !== 'pending') {
    throw new Error('FAILED_PRECONDITION: Invite is not pending');
  }

  // Actor must be owner, manager, or the person who sent the invite
  const actorRole = await verifyMemberAccess(collectionId, actorUserId, []);
  const isSender = inviteData.invited_by_user_id === actorUserId;

  if (actorRole !== 'owner' && actorRole !== 'manager' && !isSender) {
    throw new Error('PERMISSION_DENIED: Not authorized to revoke this invite');
  }

  await inviteRef.update({
    status: 'revoked',
    responded_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Write cooldown to prevent rapid spamming back and forth
  const cooldownId = `${inviteData.invited_by_user_id}_${collectionId}_${inviteData.invited_user_id}`;
  await db.collection('cooldowns').doc(cooldownId).set({
    createdAt: Date.now(),
  });

  // Log audit event
  await logAuditEvent(
    collectionId,
    actorUserId,
    'invite_revoked',
    `Revoked invite for user ${inviteData.invited_user_id}`,
    { invite_id: inviteId }
  );
}

/**
 * Decline a collection invite.
 */
export async function declineCollectionInvite(
  collectionId: string,
  actorUserId: string,
  inviteId: string
): Promise<void> {
  const db = admin.firestore();
  const inviteRef = db.collection('collections').doc(collectionId).collection('invites').doc(inviteId);
  const snap = await inviteRef.get();

  if (!snap.exists) {
    throw new Error('NOT_FOUND: Invite does not exist');
  }

  const inviteData = snap.data()! as CollectionInvite;
  if (inviteData.invited_user_id !== actorUserId) {
    throw new Error('PERMISSION_DENIED: You are not the recipient of this invite');
  }

  if (inviteData.status !== 'pending') {
    throw new Error('FAILED_PRECONDITION: Invite is not pending');
  }

  await inviteRef.update({
    status: 'declined',
    responded_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Write cooldown block
  const cooldownId = `${inviteData.invited_by_user_id}_${collectionId}_${inviteData.invited_user_id}`;
  await db.collection('cooldowns').doc(cooldownId).set({
    createdAt: Date.now(),
  });

  // Notify inviter
  const targetProfileSnap = await db.collection('users').doc(actorUserId).collection('data').doc('profile').get();
  const targetUsername = targetProfileSnap.exists ? targetProfileSnap.data()!.username : 'Someone';
  const targetDisplayName = targetProfileSnap.exists ? targetProfileSnap.data()!.displayName || targetUsername : targetUsername;

  const collSnap = await db.collection('collections').doc(collectionId).get();
  const collName = collSnap.data()!.name;

  await sendNotification(inviteData.invited_by_user_id, {
    type: 'system',
    priority: 'low',
    type_category: 'collaboration',
    title: 'Invite Declined',
    body: `${targetDisplayName} declined your invite to join "${collName}".`,
    metadata: {
      collection_id: collectionId,
      invite_id: inviteId,
    },
  });

  // Audit and security logging
  await logAuditEvent(
    collectionId,
    actorUserId,
    'invite_declined',
    `User declined the invite`,
    { invite_id: inviteId }
  );
}

/**
 * Accept a collection invite.
 */
export async function acceptCollectionInvite(
  collectionId: string,
  actorUserId: string,
  inviteId: string
): Promise<void> {
  const db = admin.firestore();
  const inviteRef = db.collection('collections').doc(collectionId).collection('invites').doc(inviteId);
  const snap = await inviteRef.get();

  if (!snap.exists) {
    throw new Error('NOT_FOUND: Invite does not exist');
  }

  const inviteData = snap.data()! as CollectionInvite;
  if (inviteData.invited_user_id !== actorUserId) {
    throw new Error('PERMISSION_DENIED: You are not the recipient of this invite');
  }

  if (inviteData.status !== 'pending') {
    throw new Error('FAILED_PRECONDITION: Invite is not pending');
  }

  // Check expiry
  if (inviteData.expires_at.toDate().getTime() < Date.now()) {
    await inviteRef.update({ status: 'expired' });
    throw new Error('FAILED_PRECONDITION: Invite has expired');
  }

  // Run as a transaction to write member and update invite atomically
  await db.runTransaction(async (transaction) => {
    // 1. Double check member is not already in
    const memberRef = db.collection('collections').doc(collectionId).collection('members').doc(actorUserId);
    const mSnap = await transaction.get(memberRef);
    if (mSnap.exists && mSnap.data()!.status === 'active') {
      throw new Error('FAILED_PRECONDITION: You are already an active member');
    }

    // 2. Accept invite
    transaction.update(inviteRef, {
      status: 'accepted',
      responded_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. Create active membership
    transaction.set(memberRef, {
      collection_id: collectionId,
      user_id: actorUserId,
      role: inviteData.role,
      status: 'active',
      joined_at: admin.firestore.FieldValue.serverTimestamp(),
      added_by_user_id: inviteData.invited_by_user_id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Notify inviter
  const targetProfileSnap = await db.collection('users').doc(actorUserId).collection('data').doc('profile').get();
  const targetUsername = targetProfileSnap.exists ? targetProfileSnap.data()!.username : 'Someone';
  const targetDisplayName = targetProfileSnap.exists ? targetProfileSnap.data()!.displayName || targetUsername : targetUsername;

  const collSnap = await db.collection('collections').doc(collectionId).get();
  const collName = collSnap.data()!.name;

  await sendNotification(inviteData.invited_by_user_id, {
    type: 'invite_accepted',
    priority: 'medium',
    type_category: 'collaboration',
    title: 'Invite Accepted',
    body: `${targetDisplayName} accepted your invite to join "${collName}".`,
    metadata: {
      collection_id: collectionId,
      invite_id: inviteId,
      new_member_uid: actorUserId,
    },
  });

  // Audit logging
  await logAuditEvent(
    collectionId,
    actorUserId,
    'invite_accepted',
    `Accepted invite to join as ${inviteData.role}`,
    { invite_id: inviteId }
  );

  // Write a sync event so all other members are notified of the membership update
  const syncEventsRef = db.collection('collections').doc(collectionId).collection('syncEvents');
  const collectionRef = db.collection('collections').doc(collectionId);
  
  await db.runTransaction(async (transaction) => {
    const cSnap = await transaction.get(collectionRef);
    const currentRevision = (cSnap.data()?.current_revision || 0) + 1;
    
    transaction.update(collectionRef, {
      current_revision: currentRevision,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const eventDoc = syncEventsRef.doc();
    transaction.set(eventDoc, {
      scope_type: 'collection',
      scope_id: collectionId,
      event_type: 'member_joined',
      revision: currentRevision,
      payload: {
        user_id: actorUserId,
        role: inviteData.role,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
