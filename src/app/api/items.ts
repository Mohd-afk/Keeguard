// ─── Items API Client Wrapper ────────────────────────────────────────────────
// Frontend wrapper to invoke item commit Cloud Function.
// ─────────────────────────────────────────────────────────────────────────────

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';

export interface CommitItemParams {
  collectionId: string;
  itemId: string;
  baseRevision: number;
  titleEnc?: string;
  itemType?: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other';
  ciphertext?: string;
  iv?: string;
  authTag?: string;
  itemKeyVersion?: number;
  wrappedItemKey?: string;
  isDelete?: boolean;
}

export interface CommitItemResult {
  success?: boolean;
  conflict?: boolean;
  latestRevision?: number;
  message?: string;
  newRevision?: number;
}

export async function commitItem(params: CommitItemParams): Promise<CommitItemResult> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<CommitItemParams, CommitItemResult>(fns, 'commitItem');
  const res = await callable(params);
  return res.data;
}
