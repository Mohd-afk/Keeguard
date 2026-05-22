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

export async function createCollection(params: CreateCollectionParams): Promise<string> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<CreateCollectionParams, { collectionId: string }>(fns, 'createCollection');
  const res = await callable(params);
  return res.data.collectionId;
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
