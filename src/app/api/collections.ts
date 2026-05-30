// ─── Shared Collections API Client Wrapper ──────────────────────────────────
// Rewritten to use direct Firestore client-side writes because Cloud Functions
// cannot be deployed on the free Spark plan.
// ─────────────────────────────────────────────────────────────────────────────

import { CollectionRole } from '../firestore/collections';
import { getFirebaseDb } from '../firebase';
import { getAuth } from 'firebase/auth';
import {
  doc,
  collection,
  writeBatch,
  serverTimestamp,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';

export interface CreateCollectionParams {
  name: string;
  description?: string;
  ownerEnvelope: {
    wrappedKey: string;
    senderPublicKeyB64: string;
  };
}

export async function createCollection(params: CreateCollectionParams): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const actorUserId = auth.currentUser.uid;
  const db = getFirebaseDb();
  
  const collRef = doc(collection(db, 'collections'));
  const collectionId = collRef.id;
  const now = serverTimestamp();
  
  const batch = writeBatch(db);
  
  batch.set(collRef, {
    owner_user_id: actorUserId,
    name: params.name.trim(),
    description: params.description ? params.description.trim() : null,
    visibility: 'shared',
    status: 'active',
    current_key_version: 1,
    current_revision: 0,
    created_at: now,
    updated_at: now,
  });

  const memberRef = doc(db, `collections/${collectionId}/members/${actorUserId}`);
  batch.set(memberRef, {
    collection_id: collectionId,
    user_id: actorUserId,
    role: 'owner',
    status: 'active',
    joined_at: now,
    added_by_user_id: actorUserId,
    created_at: now,
    updated_at: now,
  });

  const envelopeRef = doc(db, `collections/${collectionId}/keyEnvelopes/${actorUserId}`);
  batch.set(envelopeRef, {
    collection_id: collectionId,
    collection_key_version: 1,
    recipient_type: 'user',
    recipient_id: actorUserId,
    wrapped_collection_key: params.ownerEnvelope.wrappedKey,
    sender_public_key_b64: params.ownerEnvelope.senderPublicKeyB64,
    created_at: now,
  });

  const folderShareRef = doc(db, `folder_shares/${collectionId}_${actorUserId}`);
  batch.set(folderShareRef, {
    folder_id: collectionId,
    user_id: actorUserId,
    role: 'collaborator',
    status: 'accepted',
    updated_at: now,
  });

  await batch.commit();
  return collectionId;
}

export async function updateMemberRole(
  collectionId: string,
  targetUserId: string,
  newRole: CollectionRole
): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const db = getFirebaseDb();
  const memberRef = doc(db, `collections/${collectionId}/members/${targetUserId}`);
  await updateDoc(memberRef, { role: newRole, updated_at: serverTimestamp() });
}

export async function removeMember(collectionId: string, targetUserId: string): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const db = getFirebaseDb();
  const memberRef = doc(db, `collections/${collectionId}/members/${targetUserId}`);
  await updateDoc(memberRef, { status: 'removed', updated_at: serverTimestamp() });
}

export interface CreateInviteParams {
  collectionId: string;
  targetUsername: string;
  role: Exclude<CollectionRole, 'owner'>;
  message?: string;
  recipientEnvelope?: {
    wrappedKey: string;
    senderPublicKeyB64: string;
  };
}

export async function createInvite(params: CreateInviteParams): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const actorUserId = auth.currentUser.uid;
  const db = getFirebaseDb();

  // 1. Resolve targetUsername → UID via usernames collection
  const cleanUsername = params.targetUsername.toLowerCase().replace(/^@/, '');
  const usernameSnap = await getDoc(doc(db, 'usernames', cleanUsername));
  if (!usernameSnap.exists()) {
    throw new Error(`User @${params.targetUsername} not found`);
  }
  const recipientUid = usernameSnap.data().uid as string;
  if (recipientUid === actorUserId) {
    throw new Error("You cannot invite yourself");
  }

  // 2. Fetch collection name for notification
  const collSnap = await getDoc(doc(db, 'collections', params.collectionId));
  const collectionName: string = collSnap.exists() ? (collSnap.data().name as string) : 'Shared Vault';

  // 3. Fetch inviter's public profile for display name
  const inviterProfileSnap = await getDoc(doc(db, 'userProfiles', actorUserId));
  const inviterUsername: string = inviterProfileSnap.exists()
    ? (inviterProfileSnap.data().username as string)
    : 'someone';
  const inviterDisplayName: string = inviterProfileSnap.exists()
    ? ((inviterProfileSnap.data().display_name || inviterProfileSnap.data().username) as string)
    : 'A User';

  // 4. Build invite + key envelope in a single batch
  const now = serverTimestamp();
  // 7-day expiry
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const inviteRef = doc(collection(db, `collections/${params.collectionId}/invites`));
  const inviteId = inviteRef.id;

  const batch = writeBatch(db);

  batch.set(inviteRef, {
    collection_id: params.collectionId,
    invited_user_id: recipientUid,
    invited_by_user_id: actorUserId,
    role: params.role,
    status: 'pending',
    message: params.message || null,
    expires_at: expiresAt,
    created_at: now,
    responded_at: null,
    // Denormalized display fields (read by recipient UI)
    collection_name: collectionName,
    inviter_username: inviterUsername,
    inviter_display_name: inviterDisplayName,
    inviter_avatar_url: null,
  });

  // 5. Write recipient's ECDH key envelope
  if (params.recipientEnvelope) {
    const envelopeRef = doc(db, `collections/${params.collectionId}/keyEnvelopes/${recipientUid}`);
    batch.set(envelopeRef, {
      collection_id: params.collectionId,
      collection_key_version: 1,
      recipient_type: 'user',
      recipient_id: recipientUid,
      wrapped_collection_key: params.recipientEnvelope.wrappedKey,
      sender_public_key_b64: params.recipientEnvelope.senderPublicKeyB64,
      created_at: now,
    });
  }

  await batch.commit();

  // 6. Create an in-app notification for the recipient (best-effort)
  //    Firestore rules allow this if type === 'invite_received' and sender_uid matches auth.uid
  try {
    const notifRef = doc(collection(db, `users/${recipientUid}/notifications`));
    await setDoc(notifRef, {
      user_id: recipientUid,
      type: 'invite_received',
      type_category: 'collaboration',
      priority: 'high',
      title: `${inviterDisplayName} invited you to a shared vault`,
      body: params.message || `${inviterDisplayName} wants to share "${collectionName}" with you.`,
      status: 'pending',
      sender_uid: actorUserId,        // Used by security rule
      created_at: now,
      read_at: null,
      metadata: {
        collection_id: params.collectionId,
        collection_name: collectionName,
        invite_id: inviteId,
        inviter_user_id: actorUserId,
        inviter_username: inviterUsername,
        inviter_display_name: inviterDisplayName,
        inviter_avatar_url: null,
        role: params.role,
      },
    });
  } catch (notifErr) {
    // Notification delivery is best-effort — invite was already created successfully
    console.warn('[INVITE] Notification write failed (non-fatal):', notifErr);
  }

  return inviteId;
}

export async function acceptInvite(collectionId: string, inviteId: string): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const actorUserId = auth.currentUser.uid;
  const db = getFirebaseDb();

  // 1. Fetch invite to validate and get role
  const inviteRef = doc(db, `collections/${collectionId}/invites/${inviteId}`);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('Invite not found');
  const inviteData = inviteSnap.data();
  if (inviteData.invited_user_id !== actorUserId) {
    throw new Error('This invite was not sent to you');
  }
  if (inviteData.status !== 'pending') {
    throw new Error('This invite has already been responded to');
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);

  // 2. Mark invite accepted
  batch.update(inviteRef, {
    status: 'accepted',
    responded_at: now,
  });

  // 3. Add member doc (user can write their own member doc per Firestore rules)
  const memberRef = doc(db, `collections/${collectionId}/members/${actorUserId}`);
  batch.set(memberRef, {
    collection_id: collectionId,
    user_id: actorUserId,
    role: inviteData.role,
    status: 'active',
    joined_at: now,
    added_by_user_id: inviteData.invited_by_user_id,
    created_at: now,
    updated_at: now,
  });

  await batch.commit();
}

export async function declineInvite(collectionId: string, inviteId: string): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const actorUserId = auth.currentUser.uid;
  const db = getFirebaseDb();

  const inviteRef = doc(db, `collections/${collectionId}/invites/${inviteId}`);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('Invite not found');
  const inviteData = inviteSnap.data();
  if (inviteData.invited_user_id !== actorUserId) {
    throw new Error('This invite was not sent to you');
  }

  await updateDoc(inviteRef, {
    status: 'declined',
    responded_at: serverTimestamp(),
  });
}

export async function revokeInvite(collectionId: string, inviteId: string): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const db = getFirebaseDb();

  const inviteRef = doc(db, `collections/${collectionId}/invites/${inviteId}`);
  await updateDoc(inviteRef, {
    status: 'revoked',
    responded_at: serverTimestamp(),
  });
}

export interface SubmitRotatedKeysParams {
  collectionId: string;
  newKeyVersion: number;
  envelopes: Array<{
    recipientId: string;
    wrappedKey: string;
    senderPublicKeyB64: string;
  }>;
  items: Array<{
    itemId: string;
    wrappedItemKey: string;
  }>;
}

export async function submitRotatedKeys(params: SubmitRotatedKeysParams): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  // Write new key envelopes for all recipients
  for (const env of params.envelopes) {
    const envelopeRef = doc(db, `collections/${params.collectionId}/keyEnvelopes/${env.recipientId}`);
    batch.set(envelopeRef, {
      collection_id: params.collectionId,
      collection_key_version: params.newKeyVersion,
      recipient_type: 'user',
      recipient_id: env.recipientId,
      wrapped_collection_key: env.wrappedKey,
      sender_public_key_b64: env.senderPublicKeyB64,
      created_at: serverTimestamp(),
    });
  }

  // Bump collection's current_key_version
  const collRef = doc(db, 'collections', params.collectionId);
  batch.update(collRef, {
    current_key_version: params.newKeyVersion,
    updated_at: serverTimestamp(),
  });

  await batch.commit();
}

export async function transferOwnership(collectionId: string, targetUserId: string): Promise<void> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const actorUserId = auth.currentUser.uid;
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  // Demote current owner to manager
  const oldOwnerRef = doc(db, `collections/${collectionId}/members/${actorUserId}`);
  batch.update(oldOwnerRef, { role: 'manager', updated_at: serverTimestamp() });

  // Promote new owner
  const newOwnerRef = doc(db, `collections/${collectionId}/members/${targetUserId}`);
  batch.update(newOwnerRef, { role: 'owner', updated_at: serverTimestamp() });

  // Update collection owner_user_id
  const collRef = doc(db, 'collections', collectionId);
  batch.update(collRef, { owner_user_id: targetUserId, updated_at: serverTimestamp() });

  await batch.commit();
}

export async function migrateCategoryToCollection(categoryId: string, categoryName: string, ownerEnvelope: { wrappedKey: string; senderPublicKeyB64: string }): Promise<string> {
  // 1. Create the new shared collection
  const collectionId = await createCollection({
    name: categoryName,
    ownerEnvelope
  });

  // 2. Fetch all personal items that have this categoryId
  const { getFirebaseDb } = await import('../firebase');
  const { getAuth } = await import('firebase/auth');
  const { collection, getDocs, query, where, writeBatch, doc } = await import('firebase/firestore');
  
  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Unauthenticated");
  const db = getFirebaseDb();
  
  const personalItemsRef = collection(db, `users/${auth.currentUser.uid}/items`);
  const q = query(personalItemsRef, where('category_id', '==', categoryId), where('deleted_at', '==', null));
  const snap = await getDocs(q);

  // 3. Move them into the shared collection
  const batch = writeBatch(db);
  
  snap.docs.forEach((d) => {
    // Delete from personal items
    batch.delete(d.ref);
    
    // Create in shared collection items
    const newSharedItemRef = doc(db, `collections/${collectionId}/items/${d.id}`);
    batch.set(newSharedItemRef, {
       ...d.data(),
       category_id: null,
       collection_key_version: 1,
       updated_by_user_id: auth.currentUser!.uid,
    });
  });

  await batch.commit();
  return collectionId;
}
