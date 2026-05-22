// ─── Collection Invites Firestore Data Layer ──────────────────────────────────
// Client-side read operations for pending invites using collection-group queries.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { createLogger } from '../utils/logger';
import type { CollectionInvite } from './collections';

const log = createLogger('FIRESTORE_INVITES');

/**
 * Fetch all pending invites for the current user across all collections.
 * Uses a collectionGroup query on 'invites'.
 */
export async function getMyPendingInvites(userId: string): Promise<CollectionInvite[]> {
  log.info('Fetching pending invites', { userId });
  
  const q = query(
    collectionGroup(getFirebaseDb(), 'invites'),
    where('invited_user_id', '==', userId),
    where('status', '==', 'pending')
  );

  try {
    const snap = await getDocs(q);
    const invites = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as CollectionInvite));
    log.debug('Pending invites fetched', { userId, count: invites.length });
    return invites;
  } catch (err) {
    log.error('Failed to fetch pending invites', { userId, err });
    return [];
  }
}

/**
 * Subscribe to real-time changes of the user's pending/active invites.
 * Uses a collectionGroup query on 'invites'.
 */
export function subscribeToMyInvites(
  userId: string,
  callback: (invites: CollectionInvite[]) => void,
): Unsubscribe {
  log.info('Subscribing to user invites', { userId });
  
  const q = query(
    collectionGroup(getFirebaseDb(), 'invites'),
    where('invited_user_id', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as CollectionInvite));
    log.debug('Invites snapshot received', { userId, count: invites.length });
    callback(invites);
  }, (err) => {
    log.error('Invites snapshot error', { userId, err });
  });
}
