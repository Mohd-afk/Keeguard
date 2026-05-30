// ─── Shared Collections API Client Wrapper ──────────────────────────────────
// Frontend wrappers to invoke collection & invite management Cloud Functions.
// ─────────────────────────────────────────────────────────────────────────────

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';
import { CollectionRole } from '../firestore/collections';

export interface CreateCollectionParams {
  name: string;
  description?: string;
  ownerEnvelope: {
    wrappedKey: string;
    senderPublicKeyB64: string;
  };
}

import { getFirebaseDb } from '../firebase';
import { getAuth } from 'firebase/auth';
import { doc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';

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
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; targetUserId: string; newRole: CollectionRole }, void>(
    fns,
    'updateMemberRole'
  );
  await callable({ collectionId, targetUserId, newRole });
}

export async function removeMember(collectionId: string, targetUserId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; targetUserId: string }, void>(fns, 'removeMember');
  await callable({ collectionId, targetUserId });
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
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<CreateInviteParams, { inviteId: string }>(fns, 'createInvite');
  const res = await callable(params);
  return res.data.inviteId;
}

export async function acceptInvite(collectionId: string, inviteId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; inviteId: string }, void>(fns, 'acceptInvite');
  await callable({ collectionId, inviteId });
}

export async function declineInvite(collectionId: string, inviteId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; inviteId: string }, void>(fns, 'declineInvite');
  await callable({ collectionId, inviteId });
}

export async function revokeInvite(collectionId: string, inviteId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; inviteId: string }, void>(fns, 'revokeInvite');
  await callable({ collectionId, inviteId });
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
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<SubmitRotatedKeysParams, void>(fns, 'submitRotatedKeys');
  await callable(params);
}

export async function transferOwnership(collectionId: string, targetUserId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ collectionId: string; targetUserId: string }, void>(fns, 'transferOwnership');
  await callable({ collectionId, targetUserId });
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
  // (In a real ZK architecture, we would need to unwrap the personal item keys and re-wrap them with the collection key. 
  // For the UI flow prototype, we'll just move the references.)
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

  // 4. Remove the custom category from userProfile
  // For simplicity, we assume the userProfile update will be handled separately or ignored if empty.
  
  await batch.commit();
  return collectionId;
}
