/**
 * IndexedDB Async Key-Value Persistence Helper
 * Provides a lightweight promise-based wrapper around IndexedDB ('SecureVaultDB') for storing encrypted vault payloads and app settings.
 */

import { createLogger } from './utils/logger';

const log = createLogger('STORE');

const DB_NAME = 'SecureVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

/**
 * Single cached DB connection promise. Opening a new connection on every
 * operation is wasteful — we open once and reuse for the session lifetime.
 */
let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
          log.info('IndexedDB object store created', { storeName: STORE_NAME });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        log.error('Failed to open IndexedDB', request.error);
        _dbPromise = null; // allow retry on next call
        reject(request.error);
      };
    });
  }
  return _dbPromise;
}

/**
 * Get a value by key from IndexedDB.
 */
export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => {
      log.error('IndexedDB get failed', { key, error: request.error });
      reject(request.error);
    };
  });
}

/**
 * Set a value by key in IndexedDB.
 */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      log.error('IndexedDB set failed', { key, error: request.error });
      reject(request.error);
    };
  });
}

/**
 * Delete a key from IndexedDB.
 */
export async function idbDelete(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      log.error('IndexedDB delete failed', { key, error: request.error });
      reject(request.error);
    };
  });
}
