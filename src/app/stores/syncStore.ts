// ─── Real-Time Sync & Conflict Resolution Store ──────────────────────────────
// Manages zero-knowledge shared collections items, real-time sync listeners,
// offline queues, and decryption/encryption layers.
// ─────────────────────────────────────────────────────────────────────────────

import { onAuthChange, getCurrentUser } from '../auth';
import { getSessionCryptoKey } from '../store';
import {
  subscribeToMyCollections,
  subscribeToCollectionItems,
  getCollectionKeyEnvelope,
  type CollectionItem,
} from '../firestore/collections';
import {
  ensureDeviceKeyPair,
  loadDevicePrivateKey,
  unwrapCollectionKey,
  encryptCollectionItemConsistent,
  getCachedCollectionKey,
  type DecryptedCollectionItem,
} from '../crypto/collectionCrypto';
import { commitItem, type CommitItemParams } from '../api/items';
import { createLogger } from '../utils/logger';

const log = createLogger('STORE_SYNC');

export interface DecryptedCollectionItemExtended extends DecryptedCollectionItem {
  owner_id: string; // for compatibility with legacy components
  title: string;
  plaintext: string;
}

// ── In-Memory State ──────────────────────────────────────────────────────────

let _collectionItems = new Map<string, DecryptedCollectionItemExtended[]>();
let _waitingForKeys = new Set<string>(); // Collections where we are members but lack envelopes
let _collectionKeys = new Map<string, CryptoKey>(); // cache collection keys directly
let _subscribers = new Set<() => void>();
let _syncListeners = new Map<string, () => void>(); // active collection onSnapshot unsub functions
let _collectionListUnsub: (() => void) | null = null;

let _connectionState: 'connected' | 'reconnecting' | 'offline' = 'connected';
let _connectionListeners = new Set<(state: typeof _connectionState) => void>();

// Conflict Resolution State
export interface ConflictState {
  collectionId: string;
  itemId: string;
  localDraft: { title: string; plaintext: string; itemType: string };
  serverItem: DecryptedCollectionItemExtended;
  baseRevision: number;
  latestRevision: number;
}
let _activeConflict: ConflictState | null = null;
let _conflictListeners = new Set<(conflict: ConflictState | null) => void>();

// Offline mutation queue
interface QueuedMutation {
  id: string;
  params: CommitItemParams;
  retryCount: number;
}
let _queuedMutations: QueuedMutation[] = [];

// ── Auto-Initialization on Authentication ──────────────────────────────────────

onAuthChange(async (user) => {
  if (user) {
    log.info('User signed in, setting up syncStore subscription');
    
    // Setup online/offline browser listeners
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    updateConnectionState(navigator.onLine ? 'connected' : 'offline');

    // Make sure device keys are generated/persisted
    const vaultKey = getSessionCryptoKey();
    if (vaultKey) {
      try {
        await ensureDeviceKeyPair(vaultKey);
        log.info('Device ECDH keys verified');
      } catch (err) {
        log.error('Failed to ensure device keys', err);
      }
    }

    // Subscribe to collections list
    _collectionListUnsub = subscribeToMyCollections(user.uid, (collectionIds) => {
      syncWithCollectionsList(collectionIds);
    });
  } else {
    log.info('User signed out, cleaning up syncStore');
    window.removeEventListener('online', handleOnlineStatus);
    window.removeEventListener('offline', handleOfflineStatus);
    cleanupAll();
  }
});

function handleOnlineStatus() {
  updateConnectionState('connected');
  flushOfflineQueue();
}

function handleOfflineStatus() {
  updateConnectionState('offline');
}

function updateConnectionState(state: typeof _connectionState) {
  if (_connectionState === state) return;
  _connectionState = state;
  _connectionListeners.forEach((l) => l(_connectionState));
}

function cleanupAll() {
  if (_collectionListUnsub) {
    _collectionListUnsub();
    _collectionListUnsub = null;
  }
  _syncListeners.forEach((unsub) => unsub());
  _syncListeners.clear();
  _collectionItems.clear();
  _waitingForKeys.clear();
  _collectionKeys.clear();
  _queuedMutations = [];
  _activeConflict = null;
  notifySubscribers();
}

// ── Collection Sync Core ──────────────────────────────────────────────────────

async function syncWithCollectionsList(collectionIds: string[]) {
  log.info('Syncing collection list memberships', { count: collectionIds.length });
  
  let membershipChanged = false;
  // Cleanup collections we are no longer members of
  for (const cid of Array.from(_syncListeners.keys())) {
    if (!collectionIds.includes(cid)) {
      log.info('No longer a member, unsubscribing from collection', { cid });
      _syncListeners.get(cid)?.();
      _syncListeners.delete(cid);
      _collectionItems.delete(cid);
      _waitingForKeys.delete(cid);
      _collectionKeys.delete(cid);
      membershipChanged = true;
    }
  }

  if (membershipChanged) {
    import('../store').then(({ syncAllToNative }) => {
      syncAllToNative().catch((err) => log.error('Failed to sync to native on membership cleanup', err));
    });
  }

  const vaultKey = getSessionCryptoKey();
  if (!vaultKey) {
    log.warn('No active vault key in session, cannot unwrap collection keys');
    return;
  }

  // Setup subscriptions for new collections
  for (const cid of collectionIds) {
    if (!_syncListeners.has(cid)) {
      log.info('New collection membership detected, setting up key and sync', { cid });
      setupCollectionSync(cid, vaultKey);
    }
  }
}

async function setupCollectionSync(collectionId: string, vaultKey: CryptoKey) {
  try {
    const user = getCurrentUser();
    if (!user) return;

    // 1. Fetch key envelope for this user
    const envelope = await getCollectionKeyEnvelope(collectionId, user.uid);
    if (!envelope) {
      log.warn('No key envelope found for collection yet', { collectionId });
      _waitingForKeys.add(collectionId);
      notifySubscribers();
      return;
    }

    // 2. Load device private key
    const devicePrivKey = await loadDevicePrivateKey(vaultKey);
    if (!devicePrivKey) {
      throw new Error('Device private key not available');
    }

    // 3. Unwrap collection key using ECDH
    const collectionKey = await unwrapCollectionKey(
      envelope.wrapped_collection_key,
      devicePrivKey,
      envelope.sender_public_key_b64,
      collectionId,
      envelope.collection_key_version
    );

    _collectionKeys.set(collectionId, collectionKey);
    _waitingForKeys.delete(collectionId);

    // 4. Subscribe to collection items
    const unsub = subscribeToCollectionItems(collectionId, async (items) => {
      await decryptAndCacheItems(collectionId, items, collectionKey);
    });

    _syncListeners.set(collectionId, unsub);
  } catch (err) {
    log.error('Failed to set up sync for collection', { collectionId, err });
    _waitingForKeys.add(collectionId);
    notifySubscribers();
  }
}

async function decryptAndCacheItems(
  collectionId: string,
  items: CollectionItem[],
  collectionKey: CryptoKey
) {
  const decryptedItems: DecryptedCollectionItemExtended[] = [];

  for (const item of items) {
    try {
      // Skip soft deleted items
      if (item.deleted_at) continue;

      if (!item.wrapped_item_key) {
        log.warn('Collection item has no wrapped key envelope', { itemId: item.id });
        continue;
      }

      // Decrypt
      const payload = {
        ciphertext: item.ciphertext,
        iv: item.iv,
        auth_tag: item.auth_tag,
        title_enc: item.title_enc,
      };

      const decrypted = await decryptCollectionItemConsistent(
        payload,
        item.wrapped_item_key,
        collectionKey
      );

      decryptedItems.push({
        id: item.id,
        collectionId,
        owner_id: collectionId, // compatibility
        title: decrypted.title,
        plaintext: decrypted.plaintext,
        itemType: item.item_type,
        baseRevision: item.base_revision,
        latestRevision: item.latest_revision,
        createdBy: item.created_by_user_id,
        updatedBy: item.updated_by_user_id,
        createdAt: item.created_at?.toDate()?.toISOString() || new Date().toISOString(),
        updatedAt: item.updated_at?.toDate()?.toISOString() || new Date().toISOString(),
      });
    } catch (e) {
      log.error('Failed to decrypt collection item', { itemId: item.id, collectionId, e });
    }
  }

  _collectionItems.set(collectionId, decryptedItems);
  notifySubscribers();

  // Trigger unified native autofill sync
  import('../store').then(({ syncAllToNative }) => {
    syncAllToNative().catch((err) => log.error('Failed to sync to native in decryptAndCacheItems', err));
  });
}

// Separate helper for consistent title-IV decryption to match encryptCollectionItemConsistent
async function decryptCollectionItemConsistent(
  payload: { ciphertext: string; iv: string; auth_tag: string; title_enc: string },
  wrappedItemKeyB64: string,
  collectionKey: CryptoKey
): Promise<{ plaintext: string; title: string }> {
  const { decryptCollectionItem } = await import('../crypto/collectionCrypto');
  return decryptCollectionItem(payload, wrappedItemKeyB64, collectionKey);
}

function notifySubscribers() {
  _subscribers.forEach((s) => s());
}

// ── Read Accessors ───────────────────────────────────────────────────────────

export function getSharedCollectionItems(collectionId: string): DecryptedCollectionItemExtended[] {
  return _collectionItems.get(collectionId) || [];
}

export function getAllSharedCollectionItems(): DecryptedCollectionItemExtended[] {
  const all: DecryptedCollectionItemExtended[] = [];
  _collectionItems.forEach((items) => {
    all.push(...items);
  });
  return all;
}

export function isCollectionWaitingForKey(collectionId: string): boolean {
  return _waitingForKeys.has(collectionId);
}

export function getCollectionKey(collectionId: string): CryptoKey | null {
  return _collectionKeys.get(collectionId) || null;
}

export function addSyncStoreListener(listener: () => void): () => void {
  _subscribers.add(listener);
  return () => {
    _subscribers.delete(listener);
  };
}

export function getConnectionState(): typeof _connectionState {
  return _connectionState;
}

export function addConnectionStateListener(listener: (state: typeof _connectionState) => void): () => void {
  _connectionListeners.add(listener);
  return () => {
    _connectionListeners.delete(listener);
  };
}

// ── Mutators & Commits ────────────────────────────────────────────────────────

/**
 * Commit a new or edited item to a zero-knowledge shared collection.
 */
export async function commitSharedItem(
  collectionId: string,
  itemId: string,
  title: string,
  plaintext: string,
  itemType: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other' = 'login',
  baseRevision = 0
): Promise<{ success: boolean; conflict?: boolean }> {
  log.info('Committing item to shared collection', { itemId, collectionId, baseRevision });

  const collectionKey = _collectionKeys.get(collectionId);
  if (!collectionKey) {
    throw new Error('Key not available for this collection. Decryption envelope may be missing.');
  }

  // 1. Client-side encrypt consistent (drives deterministic title IV)
  const { payload, envelope } = await encryptCollectionItemConsistent(
    plaintext,
    title,
    collectionKey,
    collectionId
  );

  const params: CommitItemParams = {
    collectionId,
    itemId,
    baseRevision,
    titleEnc: payload.title_enc,
    itemType,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    authTag: payload.auth_tag,
    itemKeyVersion: 1,
    wrappedItemKey: envelope.wrapped_item_key,
    isDelete: false,
  };

  // Offline handler
  if (_connectionState === 'offline') {
    log.info('Client is offline, queueing mutation locally', { itemId });
    _queuedMutations.push({
      id: crypto.randomUUID(),
      params,
      retryCount: 0,
    });
    // Optimistic cache update would go here (omitted for strict revision correctness)
    return { success: true };
  }

  try {
    const res = await commitItem(params);
    
    if (res.conflict) {
      log.warn('Conflict detected on server commit', { itemId });
      // Trigger conflict resolution flow
      triggerConflictFlow(collectionId, itemId, { title, plaintext, itemType }, baseRevision, res.latestRevision || 0);
      return { success: false, conflict: true };
    }

    log.info('Item committed successfully to shared collection');
    return { success: true };
  } catch (err) {
    log.error('Failed to commit item', err);
    throw err;
  }
}

/**
 * Delete a collection item (soft delete).
 */
export async function deleteSharedItem(collectionId: string, itemId: string, baseRevision: number): Promise<void> {
  log.info('Soft deleting collection item', { itemId, collectionId, baseRevision });
  
  const params: CommitItemParams = {
    collectionId,
    itemId,
    baseRevision,
    isDelete: true,
  };

  if (_connectionState === 'offline') {
    _queuedMutations.push({
      id: crypto.randomUUID(),
      params,
      retryCount: 0,
    });
    return;
  }

  await commitItem(params);
  log.info('Item soft deleted successfully');
}

// ── Conflict Resolution Flow ─────────────────────────────────────────────────

function triggerConflictFlow(
  collectionId: string,
  itemId: string,
  localDraft: { title: string; plaintext: string; itemType: string },
  baseRevision: number,
  latestRevision: number
) {
  const currentItems = _collectionItems.get(collectionId) || [];
  const serverItem = currentItems.find((i) => i.id === itemId);

  if (!serverItem) {
    log.error('Conflict triggered but server item not cached', { itemId });
    return;
  }

  _activeConflict = {
    collectionId,
    itemId,
    localDraft,
    serverItem,
    baseRevision,
    latestRevision,
  };

  _conflictListeners.forEach((l) => l(_activeConflict));
}

export function getActiveConflict(): ConflictState | null {
  return _activeConflict;
}

export function addConflictListener(listener: (conflict: ConflictState | null) => void): () => void {
  _conflictListeners.add(listener);
  listener(_activeConflict);
  return () => {
    _conflictListeners.delete(listener);
  };
}

export function resolveConflict(keepLocal: boolean, customTitle?: string, customPlaintext?: string) {
  if (!_activeConflict) return;

  const { collectionId, itemId, localDraft, serverItem, latestRevision } = _activeConflict;
  
  _activeConflict = null;
  _conflictListeners.forEach((l) => l(null));

  if (keepLocal) {
    // Retry commit with updated server latestRevision as baseRevision
    const finalTitle = customTitle || localDraft.title;
    const finalPlaintext = customPlaintext || localDraft.plaintext;
    commitSharedItem(collectionId, itemId, finalTitle, finalPlaintext, localDraft.itemType as any, latestRevision);
  } else {
    log.info('User chose to keep server copy. Mutation dropped.', { itemId });
  }
}

// ── Offline Flush Queue ───────────────────────────────────────────────────────

async function flushOfflineQueue() {
  if (_queuedMutations.length === 0) return;
  log.info('Online restored, flushing offline mutation queue', { count: _queuedMutations.length });

  const mutationsToProcess = [..._queuedMutations];
  _queuedMutations = [];

  for (const mut of mutationsToProcess) {
    try {
      const res = await commitItem(mut.params);
      if (res.conflict) {
        // Find local collection item draft
        const currentItems = _collectionItems.get(mut.params.collectionId) || [];
        const serverItem = currentItems.find((i) => i.id === mut.params.itemId);
        
        // Decrypt parameters back to draft
        const collectionKey = _collectionKeys.get(mut.params.collectionId);
        if (collectionKey && serverItem && mut.params.ciphertext && mut.params.iv && mut.params.authTag && mut.params.titleEnc && mut.params.wrappedItemKey) {
          const payload = {
            ciphertext: mut.params.ciphertext,
            iv: mut.params.iv,
            auth_tag: mut.params.authTag,
            title_enc: mut.params.titleEnc,
          };
          const decrypted = await decryptCollectionItemConsistent(payload, mut.params.wrappedItemKey, collectionKey);
          
          triggerConflictFlow(
            mut.params.collectionId,
            mut.params.itemId,
            { title: decrypted.title, plaintext: decrypted.plaintext, itemType: mut.params.itemType || 'login' },
            mut.params.baseRevision,
            res.latestRevision || 0
          );
        }
      }
    } catch (e) {
      log.error('Failed to flush queued mutation, re-queueing', { mutationId: mut.id, e });
      if (mut.retryCount < 5) {
        _queuedMutations.push({
          ...mut,
          retryCount: mut.retryCount + 1,
        });
      }
    }
  }
}
