// PURPOSE: Provides implementation and configuration for helpers.ts.
// ─── Firestore Shared Helpers ─────────────────────────────────────────────────
// Ponytail-compliant helpers extracted from 7+ repeated patterns across the DB
// layer. Every helper is a single-responsibility, zero-logic wrapper.
// ─────────────────────────────────────────────────────────────────────────────

import {
    getDoc,
    onSnapshot,
    type DocumentReference,
    type Query,
    type DocumentSnapshot,
    type QuerySnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import type { Logger } from '../utils/logger';

// ── Document mapping ──────────────────────────────────────────────────────────

/**
 * Map a document snapshot to `{ id, ...data }` or null if it does not exist.
 */
export function snapToDoc<T>(snap: DocumentSnapshot): T | null {
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as T;
}

/**
 * Map an array of query document snapshots to `{ id, ...data }[]`.
 */
export function snapsToDocs<T>(snap: QuerySnapshot): T[] {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

// ── One-shot reads ────────────────────────────────────────────────────────────

/**
 * Fetch a single document and return it typed, or null if it does not exist.
 * Replaces the 3-line `getDoc → snap.exists() → snap.data()` pattern.
 */
export async function getDocOrNull<T>(ref: DocumentReference): Promise<T | null> {
    const snap = await getDoc(ref);
    return snapToDoc<T>(snap);
}

// ── Realtime subscriptions ────────────────────────────────────────────────────

/**
 * Subscribe to a single document. Calls `callback` with the typed document or
 * null when it does not exist. Logs errors via the provided logger.
 */
export function snapshotWith<T>(
    ref: DocumentReference,
    callback: (data: T | null) => void,
    log: Logger,
    label: string,
): Unsubscribe {
    return onSnapshot(ref, (snap) => {
        callback(snapToDoc<T>(snap));
    }, (err) => {
        log.error(`${label} snapshot error`, err);
    });
}

/**
 * Subscribe to a query. Calls `callback` with a typed array of documents on
 * every update. Logs errors via the provided logger.
 */
export function querySnapshotWith<T>(
    q: Query,
    callback: (items: T[]) => void,
    log: Logger,
    label: string,
): Unsubscribe {
    return onSnapshot(q, (snap) => {
        callback(snapsToDocs<T>(snap));
    }, (err) => {
        log.error(`${label} snapshot error`, err);
    });
}
