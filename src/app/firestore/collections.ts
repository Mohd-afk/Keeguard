// ─── Shared Collection Firestore Data Layer ──────────────────────────────────
// Client-side read operations for shared collections.
// All writes go through Cloud Functions (Admin SDK) for authorization enforcement.
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('FIRESTORE_COLLECTIONS');

// ── Domain types (client-side) ────────────────────────────────────────────────

export type CollectionRole = 'owner' | 'manager' | 'editor' | 'viewer';
export type CollectionStatus = 'active' | 'archived';
export type MemberStatus = 'active' | 'removed';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface SharedCollection {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'shared';
  status: CollectionStatus;
  current_key_version: number;
  current_revision: number;
  created_at: any; // Firestore Timestamp
  updated_at: any;
}

export interface CollectionMember {
  id: string;
  collection_id: string;
  user_id: string;
  role: CollectionRole;
  status: MemberStatus;
  joined_at: any;
  added_by_user_id: string;
  created_at: any;
  updated_at: any;
  // Denormalized display info (joined from userProfiles in UI)
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
}

export interface CollectionInvite {
  id: string;
  collection_id: string;
  invited_user_id: string;
  invited_by_user_id: string;
  role: Exclude<CollectionRole, 'owner'>;
  status: InviteStatus;
  message: string | null;
  expires_at: any;
  created_at: any;
  responded_at: any | null;
  // Denormalized display info
  collection_name?: string;
  inviter_username?: string;
  inviter_display_name?: string;
  inviter_avatar_url?: string | null;
}

export interface CollectionItem {
  id: string;
  owner_type: 'collection';
  owner_id: string;
  title_enc: string;
  item_type: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other';
  ciphertext: string;
  iv: string;
  auth_tag: string;
  item_key_version: number;
  base_revision: number;
  latest_revision: number;
  deleted_at: any | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: any;
  updated_at: any;
  // Attached key envelope (fetched separately)
  wrapped_item_key?: string;
  vault_item_id?: string;
  owner_user_id?: string;
}

export interface CollectionKeyEnvelope {
  id: string;
  collection_id: string;
  collection_key_version: number;
  recipient_type: 'user' | 'device';
  recipient_id: string;
  wrapped_collection_key: string;
  // Public key of the sender used to derive shared secret (ECDH)
  sender_public_key_b64: string;
  created_at: any;
}

export interface SyncEvent {
  id: string;
  scope_type: 'collection';
  scope_id: string;
  event_type: string;
  revision: number;
  payload: Record<string, unknown>;
  created_at: any;
}

// ── Firestore path helpers ────────────────────────────────────────────────────

function collectionRef(collectionId: string) {
  return doc(getFirebaseDb(), 'collections', collectionId);
}

function membersRef(collectionId: string) {
  return collection(getFirebaseDb(), 'collections', collectionId, 'members');
}

function memberRef(collectionId: string, userId: string) {
  return doc(getFirebaseDb(), 'collections', collectionId, 'members', userId);
}

function invitesRef(collectionId: string) {
  return collection(getFirebaseDb(), 'collections', collectionId, 'invites');
}

function itemsRef(collectionId: string) {
  return collection(getFirebaseDb(), 'collections', collectionId, 'items');
}

function itemRef(collectionId: string, itemId: string) {
  return doc(getFirebaseDb(), 'collections', collectionId, 'items', itemId);
}

function keyEnvelopeRef(collectionId: string, recipientId: string) {
  return doc(getFirebaseDb(), 'collections', collectionId, 'keyEnvelopes', recipientId);
}

function syncEventsRef(collectionId: string) {
  return collection(getFirebaseDb(), 'collections', collectionId, 'syncEvents');
}

function userInvitesRef(userId: string) {
  // Collection-group query across all collections
  return collection(getFirebaseDb(), 'invites');
}

// ── Collection reads ──────────────────────────────────────────────────────────

export async function getSharedCollection(collectionId: string): Promise<SharedCollection | null> {
  log.debug('Fetching shared collection', { collectionId });
  const snap = await getDoc(collectionRef(collectionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SharedCollection;
}

export function subscribeToSharedCollection(
  collectionId: string,
  callback: (collection: SharedCollection | null) => void,
): Unsubscribe {
  log.info('Subscribing to shared collection', { collectionId });
  return onSnapshot(collectionRef(collectionId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: snap.id, ...snap.data() } as SharedCollection);
  }, (err) => {
    log.error('Collection snapshot error', { collectionId, err });
  });
}

// ── Member reads ──────────────────────────────────────────────────────────────

export async function getMyMembership(
  collectionId: string,
  userId: string,
): Promise<CollectionMember | null> {
  const snap = await getDoc(memberRef(collectionId, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CollectionMember;
}

export function subscribeToCollectionMembers(
  collectionId: string,
  callback: (members: CollectionMember[]) => void,
): Unsubscribe {
  log.info('Subscribing to collection members', { collectionId });
  const q = query(membersRef(collectionId), where('status', '==', 'active'));

  return onSnapshot(q, (snap) => {
    const members: CollectionMember[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as CollectionMember));
    log.debug('Members snapshot received', { collectionId, count: members.length });
    callback(members);
  }, (err) => {
    log.error('Members snapshot error', { collectionId, err });
  });
}

// ── Item reads ────────────────────────────────────────────────────────────────

export function subscribeToCollectionItems(
  collectionId: string,
  callback: (items: CollectionItem[]) => void,
): Unsubscribe {
  log.info('Subscribing to collection items', { collectionId });
  const q = query(
    itemsRef(collectionId),
    where('deleted_at', '==', null),
    orderBy('updated_at', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const items: CollectionItem[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as CollectionItem));
    log.debug('Items snapshot received', { collectionId, count: items.length });
    callback(items);
  }, (err) => {
    log.error('Items snapshot error', { collectionId, err });
  });
}

export async function getCollectionItem(
  collectionId: string,
  itemId: string,
): Promise<CollectionItem | null> {
  const snap = await getDoc(itemRef(collectionId, itemId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CollectionItem;
}

// ── Key Envelope reads ────────────────────────────────────────────────────────

/**
 * Fetch this user's collection key envelope for a specific collection.
 * The envelope contains the ECDH-wrapped collection key.
 */
export async function getCollectionKeyEnvelope(
  collectionId: string,
  userId: string,
): Promise<CollectionKeyEnvelope | null> {
  log.debug('Fetching collection key envelope', { collectionId, userId });
  const snap = await getDoc(keyEnvelopeRef(collectionId, userId));
  if (!snap.exists()) {
    log.warn('No collection key envelope found', { collectionId, userId });
    return null;
  }
  return { id: snap.id, ...snap.data() } as CollectionKeyEnvelope;
}

// ── Sync event reads (delta catch-up) ────────────────────────────────────────

export function subscribeToSyncEvents(
  collectionId: string,
  sinceRevision: number,
  callback: (events: SyncEvent[]) => void,
): Unsubscribe {
  log.info('Subscribing to sync events', { collectionId, sinceRevision });
  const q = query(
    syncEventsRef(collectionId),
    where('revision', '>', sinceRevision),
    orderBy('revision', 'asc'),
    limit(100),
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const events: SyncEvent[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as SyncEvent));
    log.debug('Sync events received', { collectionId, count: events.length });
    callback(events);
  }, (err) => {
    log.error('Sync events snapshot error', { collectionId, err });
  });
}

export async function fetchDeltaSince(
  collectionId: string,
  sinceRevision: number,
): Promise<SyncEvent[]> {
  log.info('Fetching delta sync events', { collectionId, sinceRevision });
  const q = query(
    syncEventsRef(collectionId),
    where('revision', '>', sinceRevision),
    orderBy('revision', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SyncEvent));
}

// ── User's collections (where they are active member) ─────────────────────────

export function subscribeToMyCollections(
  userId: string,
  callback: (collectionIds: string[]) => void,
): Unsubscribe {
  log.info('Subscribing to user collections membership', { userId });

  // Query all members sub-collections where user_id == userId and status == active
  const cgQuery = query(
    collectionGroup(getFirebaseDb(), 'members'),
    where('user_id', '==', userId),
    where('status', '==', 'active'),
  );

  return onSnapshot(cgQuery, (snap) => {
    const ids = snap.docs.map((d) => d.ref.parent.parent!.id);
    log.debug('User collections updated', { userId, count: ids.length });
    callback(ids);
  }, (err) => {
    log.error('User collections snapshot error', { userId, err });
    // If the index is missing, it fails. We should stop the loading spinner by returning an empty array.
    callback([]);
  });
}

// ── Pending invites for a collection ─────────────────────────────────────────

export async function getCollectionPendingInvites(
  collectionId: string,
): Promise<CollectionInvite[]> {
  const q = query(
    invitesRef(collectionId),
    where('status', '==', 'pending'),
    orderBy('created_at', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CollectionInvite));
}

export function subscribeToCollectionPendingInvites(
  collectionId: string,
  callback: (invites: CollectionInvite[]) => void,
): Unsubscribe {
  const q = query(
    invitesRef(collectionId),
    where('status', '==', 'pending'),
    orderBy('created_at', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CollectionInvite));
    callback(invites);
  }, (err) => {
    log.error('Pending invites snapshot error', { collectionId, err });
  });
}
