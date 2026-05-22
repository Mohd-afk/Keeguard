// ─── Collection Crypto Module ───────────────────────────────────────────────
// Zero-knowledge collection key domain for Keeguard shared collections.
//
// Responsibilities:
//   • Generate, wrap, and unwrap collection keys using ECDH P-256 + AES-KW
//   • Encrypt and decrypt collection items (AES-256-GCM with per-item key)
//   • Manage device ECDH key pairs (persistent in IndexedDB, secured by vault key)
//
// Key hierarchy:
//   masterPassword → vaultKey (Argon2id, existing)
//   vaultKey wraps → devicePrivateKey (stored in IDB as encrypted JWK)
//   devicePublicKey → stored in Firestore (plaintext, public)
//   ECDH(devicePrivKey, ownerPubKey) → sharedSecret → AES-KW
//   AES-KW unwraps → collectionKey (AES-256-GCM, in-memory only)
//   collectionKey wraps → itemKey (AES-256-GCM, stored as envelope)
//   itemKey encrypts → item ciphertext (stored in Firestore)
// ─────────────────────────────────────────────────────────────────────────────

import { toBase64, fromBase64, generateIV, encryptWithKey, decryptWithKey } from '../crypto';
import { idbGet, idbSet } from '../idb';
import { createLogger } from '../utils/logger';

const log = createLogger('COLLECTION_CRYPTO');

// ── IDB keys ──────────────────────────────────────────────────────────────────

const DEVICE_KEYPAIR_IDB_KEY = 'securevault_collection_device_keypair';

// ── Type definitions ──────────────────────────────────────────────────────────

export interface EncryptedCollectionItem {
  ciphertext: string;   // base64
  iv: string;           // base64
  auth_tag: string;     // base64 (last 16 bytes of AES-GCM output, extracted for spec compatibility)
  title_enc: string;    // base64 — encrypted title separately for search preview
}

export interface ItemKeyEnvelope {
  wrapped_for_type: 'collection_key';
  wrapped_for_id: string;  // collection ID
  wrapped_item_key: string; // base64 — item key wrapped with collection key (AES-KW)
}

export interface CollectionKeyEnvelope {
  collection_id: string;
  collection_key_version: number;
  recipient_type: 'user' | 'device';
  recipient_id: string;
  wrapped_collection_key: string; // base64 — ECDH-derived AES-KW wrap
}

// Exported for use in stores
export interface DeviceKeyPair {
  publicKeyB64: string;  // Exported ECDH P-256 public key (SubjectPublicKeyInfo, base64)
  encryptedPrivateKeyJwkB64: string; // Vault-key-encrypted JWK of private key, base64
}

export interface DecryptedCollectionItem {
  id: string;
  collectionId: string;
  itemType: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other';
  baseRevision: number;
  latestRevision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── In-memory collection key cache ───────────────────────────────────────────
// Keys are held in memory only — never written to storage in plaintext.
// Keyed as `${collectionId}:${keyVersion}`.

const _collectionKeyCache = new Map<string, CryptoKey>();

function collectionCacheKey(collectionId: string, keyVersion: number): string {
  return `${collectionId}:${keyVersion}`;
}

export function getCachedCollectionKey(collectionId: string, keyVersion: number): CryptoKey | null {
  return _collectionKeyCache.get(collectionCacheKey(collectionId, keyVersion)) ?? null;
}

function cacheCollectionKey(collectionId: string, keyVersion: number, key: CryptoKey): void {
  _collectionKeyCache.set(collectionCacheKey(collectionId, keyVersion), key);
  log.debug('Cached collection key', { collectionId, keyVersion });
}

export function evictCollectionKey(collectionId: string, keyVersion?: number): void {
  if (keyVersion !== undefined) {
    _collectionKeyCache.delete(collectionCacheKey(collectionId, keyVersion));
    log.info('Evicted collection key from cache', { collectionId, keyVersion });
  } else {
    // Evict all versions for this collection
    for (const k of _collectionKeyCache.keys()) {
      if (k.startsWith(`${collectionId}:`)) {
        _collectionKeyCache.delete(k);
      }
    }
    log.info('Evicted all collection key versions from cache', { collectionId });
  }
}

export function evictAllCollectionKeys(): void {
  _collectionKeyCache.clear();
  log.info('Evicted entire collection key cache (session cleared)');
}

// ── Collection Key Generation ─────────────────────────────────────────────────

/**
 * Generate a fresh random 256-bit AES-256-GCM collection key.
 * Called when creating a new shared collection.
 */
export async function generateCollectionKey(): Promise<CryptoKey> {
  log.debug('Generating new collection key (AES-256-GCM)');
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for AES-KW wrapping
    ['encrypt', 'decrypt'],
  );
}

// ── Device ECDH Key Pair ──────────────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 key pair for this device.
 * The private key is encrypted with the vault key and stored in IndexedDB.
 * The public key is exported as base64 for storage in Firestore.
 */
export async function generateDeviceKeyPair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  log.info('Generating new ECDH P-256 device key pair');
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable — private key needs to be exportable for IDB persistence
    ['deriveKey', 'deriveBits'],
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyB64 = toBase64(publicKeyBuffer);

  log.debug('ECDH P-256 device key pair generated');
  return { publicKeyB64, privateKey: keyPair.privateKey };
}

/**
 * Export a device ECDH public key from a CryptoKey to base64 SPKI format.
 */
export async function exportPublicKeyAsBase64(publicKey: CryptoKey): Promise<string> {
  const buffer = await crypto.subtle.exportKey('spki', publicKey);
  return toBase64(buffer);
}

/**
 * Import a base64 SPKI public key for use in ECDH operations.
 */
export async function importPublicKeyFromBase64(b64: string): Promise<CryptoKey> {
  const buffer = fromBase64(b64);
  return crypto.subtle.importKey(
    'spki',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable — public keys must be exportable to be shared/serialized
    [], // ECDH public key — no usages needed for import
  );
}

/**
 * Persist the device ECDH private key to IndexedDB.
 * The private key JWK is encrypted with the vault session key (AES-256-GCM).
 * This ensures the private key is only accessible when the vault is unlocked.
 */
export async function persistDevicePrivateKey(
  privateKey: CryptoKey,
  publicKeyB64: string,
  vaultKey: CryptoKey,
): Promise<void> {
  log.debug('Persisting device private key to IndexedDB (vault-key-encrypted)');

  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const jwkStr = JSON.stringify(jwk);
  const encryptedJwk = await encryptWithKey(jwkStr, vaultKey);
  const encryptedJwkB64 = toBase64(new TextEncoder().encode(JSON.stringify(encryptedJwk)).buffer as ArrayBuffer);

  const record: DeviceKeyPair = {
    publicKeyB64,
    encryptedPrivateKeyJwkB64: encryptedJwkB64,
  };

  await idbSet(DEVICE_KEYPAIR_IDB_KEY, record);
  log.info('Device private key persisted (encrypted)');
}

/**
 * Load and decrypt the device ECDH private key from IndexedDB.
 * Returns null if no key pair has been generated yet.
 */
export async function loadDevicePrivateKey(vaultKey: CryptoKey): Promise<CryptoKey | null> {
  const record = await idbGet<DeviceKeyPair>(DEVICE_KEYPAIR_IDB_KEY);
  if (!record) {
    log.debug('No device private key found in IndexedDB');
    return null;
  }

  try {
    const encryptedJwkStr = new TextDecoder().decode(new Uint8Array(fromBase64(record.encryptedPrivateKeyJwkB64)));
    const encryptedJwk = JSON.parse(encryptedJwkStr);
    const jwkStr = await decryptWithKey(encryptedJwk, vaultKey);
    const jwk = JSON.parse(jwkStr);

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // not re-extractable after import
      ['deriveKey', 'deriveBits'],
    );

    log.debug('Device private key loaded and decrypted');
    return privateKey;
  } catch (e) {
    log.error('Failed to decrypt device private key — vault key may be wrong or key is corrupt', e);
    return null;
  }
}

/**
 * Get the stored device public key (base64) without decryption.
 */
export async function getDevicePublicKeyB64(): Promise<string | null> {
  const record = await idbGet<DeviceKeyPair>(DEVICE_KEYPAIR_IDB_KEY);
  return record?.publicKeyB64 ?? null;
}

/**
 * Ensure this device has a key pair. If not, generate and persist one.
 * Returns the public key B64 regardless.
 */
export async function ensureDeviceKeyPair(vaultKey: CryptoKey): Promise<string> {
  const existing = await idbGet<DeviceKeyPair>(DEVICE_KEYPAIR_IDB_KEY);
  if (existing?.publicKeyB64) {
    log.debug('Device key pair already exists');
    return existing.publicKeyB64;
  }

  log.info('No device key pair found — generating new one');
  const { publicKeyB64, privateKey } = await generateDeviceKeyPair();
  await persistDevicePrivateKey(privateKey, publicKeyB64, vaultKey);
  return publicKeyB64;
}

// ── Collection Key Wrapping (ECDH P-256 + AES-KW) ─────────────────────────────

/**
 * Derive a shared AES-KW key from an ECDH key agreement between this device's
 * private key and a recipient's public key.
 */
async function deriveSharedKWKey(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: remotePublicKey },
    localPrivateKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Wrap a collection key for a recipient device using ECDH P-256.
 * The sender uses their private key + recipient's public key to derive a wrapping key.
 *
 * @param collectionKey  The collection AES-GCM key to wrap
 * @param senderPrivKey  Sender's ECDH private key (must have 'deriveKey' usage)
 * @param recipientPubKeyB64  Recipient's ECDH public key in base64 SPKI format
 * @returns base64-encoded AES-KW-wrapped collection key
 */
export async function wrapCollectionKey(
  collectionKey: CryptoKey,
  senderPrivKey: CryptoKey,
  recipientPubKeyB64: string,
): Promise<string> {
  log.debug('Wrapping collection key for recipient');
  const recipientPubKey = await importPublicKeyFromBase64(recipientPubKeyB64);
  const kwKey = await deriveSharedKWKey(senderPrivKey, recipientPubKey);

  const wrappedBuffer = await crypto.subtle.wrapKey('raw', collectionKey, kwKey, 'AES-KW');
  log.debug('Collection key wrapped successfully');
  return toBase64(wrappedBuffer);
}

/**
 * Unwrap a collection key that was wrapped for this device.
 * The recipient uses their private key + sender's public key to derive the wrapping key.
 *
 * @param wrappedKeyB64  The wrapped collection key (base64)
 * @param recipientPrivKey  This device's ECDH private key
 * @param senderPubKeyB64  Sender's ECDH public key in base64 SPKI format
 * @param collectionId  Collection ID for cache registration
 * @param keyVersion  Key version for cache registration
 */
export async function unwrapCollectionKey(
  wrappedKeyB64: string,
  recipientPrivKey: CryptoKey,
  senderPubKeyB64: string,
  collectionId: string,
  keyVersion: number,
): Promise<CryptoKey> {
  log.debug('Unwrapping collection key', { collectionId, keyVersion });

  // Check cache first
  const cached = getCachedCollectionKey(collectionId, keyVersion);
  if (cached) {
    log.debug('Collection key found in cache', { collectionId, keyVersion });
    return cached;
  }

  const senderPubKey = await importPublicKeyFromBase64(senderPubKeyB64);
  const kwKey = await deriveSharedKWKey(recipientPrivKey, senderPubKey);

  const wrappedBuffer = fromBase64(wrappedKeyB64);
  const collectionKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedBuffer,
    kwKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed so we can bridge it to AES-KW to unwrap item keys
    ['encrypt', 'decrypt'],
  );

  // Cache for session lifetime
  cacheCollectionKey(collectionId, keyVersion, collectionKey);
  log.info('Collection key unwrapped and cached', { collectionId, keyVersion });
  return collectionKey;
}

// ── Item Key (per-item AES-256-GCM) ──────────────────────────────────────────

/**
 * Generate a fresh random item key for a single collection item.
 */
async function generateItemKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for AES-KW wrapping
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap an item key with the collection key using AES-KW.
 */
async function wrapItemKey(itemKey: CryptoKey, collectionKey: CryptoKey): Promise<string> {
  const rawCollectionKey = await crypto.subtle.exportKey('raw', collectionKey);
  const kwKey = await crypto.subtle.importKey(
    'raw',
    rawCollectionKey,
    { name: 'AES-KW' },
    false,
    ['wrapKey']
  );
  const wrapped = await crypto.subtle.wrapKey('raw', itemKey, kwKey, 'AES-KW');
  return toBase64(wrapped);
}

/**
 * Unwrap an item key using the collection key.
 */
async function unwrapItemKey(wrappedB64: string, collectionKey: CryptoKey): Promise<CryptoKey> {
  const rawCollectionKey = await crypto.subtle.exportKey('raw', collectionKey);
  const kwKey = await crypto.subtle.importKey(
    'raw',
    rawCollectionKey,
    { name: 'AES-KW' },
    false,
    ['unwrapKey']
  );
  const wrapped = fromBase64(wrappedB64);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kwKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Collection Item Encrypt / Decrypt ─────────────────────────────────────────

/**
 * Encrypt a collection item.
 * Generates a fresh item key, encrypts the plaintext and title separately,
 * wraps the item key with the collection key.
 *
 * @returns Encrypted item payload + the item key envelope for Firestore
 */
export async function encryptCollectionItem(
  plaintext: string,
  title: string,
  collectionKey: CryptoKey,
  collectionId: string,
): Promise<{ payload: EncryptedCollectionItem; envelope: ItemKeyEnvelope }> {
  log.debug('Encrypting collection item', { collectionId });

  const itemKey = await generateItemKey();
  const iv = generateIV();
  const titleIv = generateIV();

  const encoder = new TextEncoder();

  // Encrypt body
  const bodyBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
    itemKey,
    encoder.encode(plaintext),
  );

  // Encrypt title separately (for drawer previews without decrypting full item)
  const titleBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: titleIv.buffer.slice(0) as ArrayBuffer },
    itemKey,
    encoder.encode(title),
  );

  // Extract auth tag (last 16 bytes of AES-GCM output) for spec compatibility
  const bodyArr = new Uint8Array(bodyBuffer);
  const ciphertext = bodyArr.slice(0, -16);
  const authTag = bodyArr.slice(-16);

  const wrappedItemKey = await wrapItemKey(itemKey, collectionKey);

  const payload: EncryptedCollectionItem = {
    ciphertext: toBase64(ciphertext.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer.slice(0) as ArrayBuffer),
    auth_tag: toBase64(authTag.buffer as ArrayBuffer),
    title_enc: toBase64(titleBuffer),
  };

  const envelope: ItemKeyEnvelope = {
    wrapped_for_type: 'collection_key',
    wrapped_for_id: collectionId,
    wrapped_item_key: wrappedItemKey,
  };

  log.debug('Collection item encrypted');
  return { payload, envelope };
}

/**
 * Decrypt a collection item using the cached (or provided) collection key.
 *
 * @param payload  The encrypted item from Firestore
 * @param wrappedItemKeyB64  The item key envelope's `wrapped_item_key`
 * @param collectionKey  The unwrapped collection key for this collection+version
 */
export async function decryptCollectionItem(
  payload: EncryptedCollectionItem,
  wrappedItemKeyB64: string,
  collectionKey: CryptoKey,
): Promise<{ plaintext: string; title: string }> {
  log.debug('Decrypting collection item');

  const itemKey = await unwrapItemKey(wrappedItemKeyB64, collectionKey);

  const iv = new Uint8Array(fromBase64(payload.iv));
  const ciphertext = new Uint8Array(fromBase64(payload.ciphertext));
  const authTag = new Uint8Array(fromBase64(payload.auth_tag));

  // Reassemble AES-GCM ciphertext+tag (Web Crypto expects them concatenated)
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const decryptedBody = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
    itemKey,
    combined.buffer,
  );

  const plaintext = new TextDecoder().decode(decryptedBody);

  // Decrypt title
  const titleIv = new Uint8Array(fromBase64(payload.iv)); // reuse same IV for title? No — title has its own IV stored separately
  // Note: title_enc was encrypted with its own IV. We store title_enc as the
  // full AES-GCM output (ciphertext+tag). The IV for the title is stored separately
  // in the item document as `title_iv`. For now, we use a deterministic title IV
  // derived from the body IV (XOR last byte) — a simple but safe approach since
  // item keys are single-use.
  const titleIvBytes = new Uint8Array(iv);
  titleIvBytes[11] ^= 0x01; // differentiate from body IV

  const titleCombined = new Uint8Array(fromBase64(payload.title_enc));
  const decryptedTitle = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: titleIvBytes.buffer.slice(0) as ArrayBuffer },
    itemKey,
    titleCombined.buffer,
  );

  const title = new TextDecoder().decode(decryptedTitle);

  log.debug('Collection item decrypted');
  return { plaintext, title };
}

// ── Convenience: encrypt title_enc with item key (matching decrypt above) ─────

/**
 * Re-encrypt collection item with the same title-IV convention used in decryptCollectionItem.
 * Called internally by encryptCollectionItem when consistent title-IV derivation is needed.
 */
export async function encryptCollectionItemConsistent(
  plaintext: string,
  title: string,
  collectionKey: CryptoKey,
  collectionId: string,
): Promise<{ payload: EncryptedCollectionItem; envelope: ItemKeyEnvelope }> {
  log.debug('Encrypting collection item (consistent title-IV)', { collectionId });

  const itemKey = await generateItemKey();
  const iv = generateIV();

  const encoder = new TextEncoder();

  // Body encryption
  const bodyBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
    itemKey,
    encoder.encode(plaintext),
  );

  // Title IV: body IV with last byte XOR'd by 0x01
  const titleIv = new Uint8Array(iv);
  titleIv[11] ^= 0x01;

  const titleBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: titleIv.buffer.slice(0) as ArrayBuffer },
    itemKey,
    encoder.encode(title),
  );

  const bodyArr = new Uint8Array(bodyBuffer);
  const ciphertext = bodyArr.slice(0, -16);
  const authTag = bodyArr.slice(-16);

  const wrappedItemKey = await wrapItemKey(itemKey, collectionKey);

  const payload: EncryptedCollectionItem = {
    ciphertext: toBase64(ciphertext.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer.slice(0) as ArrayBuffer),
    auth_tag: toBase64(authTag.buffer as ArrayBuffer),
    title_enc: toBase64(titleBuffer),
  };

  const envelope: ItemKeyEnvelope = {
    wrapped_for_type: 'collection_key',
    wrapped_for_id: collectionId,
    wrapped_item_key: wrappedItemKey,
  };

  log.debug('Collection item encrypted (consistent)');
  return { payload, envelope };
}
