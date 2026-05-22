// ─── Collection Access Store ──────────────────────────────────────────────────
// Reactive in-memory state store for managing a collection's members and invites.
// Handles active subscriptions to members and invites subcollections.
// ─────────────────────────────────────────────────────────────────────────────

import { onAuthChange } from '../auth';
import {
  subscribeToCollectionMembers,
  subscribeToCollectionPendingInvites,
  type CollectionMember,
  type CollectionInvite,
  type CollectionRole,
} from '../firestore/collections';
import {
  createInvite as apiCreateInvite,
  updateMemberRole as apiUpdateMemberRole,
  removeMember as apiRemoveMember,
  revokeInvite as apiRevokeInvite,
} from '../api/collections';
import { searchUsers, type UserSearchResult } from '../api/users';
import { createLogger } from '../utils/logger';

const log = createLogger('STORE_ACCESS');

let _activeCollectionId: string | null = null;
let _members: CollectionMember[] = [];
let _pendingInvites: CollectionInvite[] = [];

let _unsubMembers: (() => void) | null = null;
let _unsubInvites: (() => void) | null = null;

let _accessChangeListeners: Array<() => void> = [];

// Clean up subscriptions on user logout
onAuthChange((user) => {
  if (!user) {
    log.info('User signed out, cleaning up access store');
    cleanupSubscriptions();
    _activeCollectionId = null;
    _members = [];
    _pendingInvites = [];
    notifyAccessListeners();
  }
});

function cleanupSubscriptions() {
  if (_unsubMembers) {
    _unsubMembers();
    _unsubMembers = null;
  }
  if (_unsubInvites) {
    _unsubInvites();
    _unsubInvites = null;
  }
}

function notifyAccessListeners() {
  log.debug('Notifying access change listeners', { count: _accessChangeListeners.length });
  _accessChangeListeners.forEach((l) => l());
}

// ── Selection & Subscriptions ─────────────────────────────────────────────────

export function getActiveCollectionId(): string | null {
  return _activeCollectionId;
}

export function getActiveCollectionMembers(): CollectionMember[] {
  return _members;
}

export function getActiveCollectionInvites(): CollectionInvite[] {
  return _pendingInvites;
}

/**
 * Change the active collection and set up real-time firestore listeners for it.
 */
export function setActiveCollectionId(collectionId: string | null): void {
  if (_activeCollectionId === collectionId) return;

  log.info('Setting active collection ID', { collectionId });
  cleanupSubscriptions();
  _activeCollectionId = collectionId;
  _members = [];
  _pendingInvites = [];

  if (collectionId) {
    // 1. Subscribe to collection members
    _unsubMembers = subscribeToCollectionMembers(collectionId, (members) => {
      _members = members;
      notifyAccessListeners();
    });

    // 2. Subscribe to collection invites
    _unsubInvites = subscribeToCollectionPendingInvites(collectionId, (invites) => {
      _pendingInvites = invites;
      notifyAccessListeners();
    });
  } else {
    notifyAccessListeners();
  }
}

/**
 * Register a listener to reactive updates of the access state.
 */
export function addAccessChangeListener(listener: () => void): () => void {
  _accessChangeListeners.push(listener);
  // Call immediately for initial sync
  listener();
  return () => {
    _accessChangeListeners = _accessChangeListeners.filter((l) => l !== listener);
  };
}

// ── Operations & API mutations ────────────────────────────────────────────────

/**
 * Search user profiles by username prefix.
 */
export async function searchProfiles(queryText: string): Promise<UserSearchResult[]> {
  if (!queryText.trim()) return [];
  log.info('Searching profiles', { queryText });
  return searchUsers(queryText);
}

/**
 * Send an invite to another user.
 */
export async function sendInvite(
  targetUsername: string,
  role: Exclude<CollectionRole, 'owner'>,
  message?: string,
): Promise<string> {
  const cid = _activeCollectionId;
  if (!cid) throw new Error('No active collection selected');

  log.info('Sending invite to user', { targetUsername, role, cid });
  const inviteId = await apiCreateInvite({
    collectionId: cid,
    targetUsername,
    role,
    message,
  });

  log.info('Invite sent successfully', { inviteId });
  return inviteId;
}

/**
 * Revoke an existing pending invite.
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  const cid = _activeCollectionId;
  if (!cid) throw new Error('No active collection selected');

  log.info('Revoking invite', { inviteId, cid });
  await apiRevokeInvite(cid, inviteId);
  log.info('Invite revoked successfully');
}

/**
 * Modify a member's role (step-up auth check is enforced on backend).
 */
export async function changeMemberRole(targetUserId: string, newRole: CollectionRole): Promise<void> {
  const cid = _activeCollectionId;
  if (!cid) throw new Error('No active collection selected');

  log.info('Updating member role', { targetUserId, newRole, cid });
  await apiUpdateMemberRole(cid, targetUserId, newRole);
  log.info('Member role updated successfully');
}

/**
 * Remove a member from the collection (status set to removed).
 */
export async function removeMember(targetUserId: string): Promise<void> {
  const cid = _activeCollectionId;
  if (!cid) throw new Error('No active collection selected');

  log.info('Removing member from collection', { targetUserId, cid });
  await apiRemoveMember(cid, targetUserId);
  log.info('Member removed successfully');
}
