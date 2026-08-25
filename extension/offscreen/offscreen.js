// PURPOSE: Browser extension offscreen document handling offscreen.js.
// ─── KeeGuard Offscreen Document ─────────────────────────────────────
// Runs in a hidden DOM page. Handles Argon2id key derivation via hash-wasm
// since WASM requires DOM context (not available in service workers).
// Also handles AES-GCM encrypt/decrypt using SubtleCrypto.
// ─────────────────────────────────────────────────────────────────────

const ARGON2_MEMORY = 65536;     // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;   // 256-bit output

// ── Helpers ──────────────────────────────────────────────────────────

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Core Argon2id Derivation ─────────────────────────────────────────

async function deriveRawArgon2id(passwordBytes, salt) {
  const saltBytes = new TextEncoder().encode(salt);

  // hash-wasm is loaded globally via the UMD bundle in offscreen.html
  // It exposes hashWasm.argon2id on the window object
  const hashFn = (typeof hashWasm !== 'undefined' && hashWasm.argon2id)
    || (typeof argon2id !== 'undefined' && argon2id);

  if (!hashFn) {
    throw new Error('hash-wasm argon2id not available. Make sure lib/argon2id.umd.min.js is present.');
  }

  const hashHex = await hashFn({
    password: passwordBytes,
    salt: saltBytes,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  });

  return hexToBytes(hashHex);
}

// ── Key Derivation Functions ─────────────────────────────────────────

async function deriveAuthKey(masterPassword, email) {
  const pwdBytes = new TextEncoder().encode(masterPassword);
  const salt = email.toLowerCase().trim();
  const hashBytes = await deriveRawArgon2id(pwdBytes, salt);
  const b64 = toBase64(hashBytes.buffer);
  hashBytes.fill(0);
  pwdBytes.fill(0);
  return b64;
}

async function deriveEncryptionKeyRaw(masterPassword, email) {
  const pwdBytes = new TextEncoder().encode(masterPassword);
  const salt = email.toLowerCase().trim() + 'vault';
  const rawKey = await deriveRawArgon2id(pwdBytes, salt);
  const b64 = toBase64(rawKey.buffer);
  rawKey.fill(0);
  pwdBytes.fill(0);
  return b64;
}

// ── AES-GCM Operations ──────────────────────────────────────────────

async function importKey(dekBase64) {
  const rawKey = new Uint8Array(fromBase64(dekBase64));
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  rawKey.fill(0);
  return key;
}

async function decryptPayload(encryptedPayloadJson, dekBase64) {
  const payload = typeof encryptedPayloadJson === 'string'
    ? JSON.parse(encryptedPayloadJson)
    : encryptedPayloadJson;

  const key = await importKey(dekBase64);
  const iv = new Uint8Array(fromBase64(payload.iv));
  const ciphertext = fromBase64(payload.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function encryptPayload(plaintext, dekBase64) {
  const key = await importKey(dekBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: toBase64(encrypted),
    iv: toBase64(iv.buffer),
  };
}

// ── Message Handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  const handleAsync = async () => {
    switch (message.action) {
      case 'deriveAuthKey': {
        const authKey = await deriveAuthKey(message.masterPassword, message.email);
        return { success: true, authKey };
      }

      case 'deriveEncryptionKey': {
        const dekBase64 = await deriveEncryptionKeyRaw(message.masterPassword, message.email);
        return { success: true, dekBase64 };
      }

      case 'decrypt': {
        const plaintext = await decryptPayload(message.encryptedPayload, message.dekBase64);
        return { success: true, plaintext };
      }

      case 'encrypt': {
        const payload = await encryptPayload(message.plaintext, message.dekBase64);
        return { success: true, payload };
      }

      default:
        return { success: false, error: `Unknown action: ${message.action}` };
    }
  };

  handleAsync()
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep the message channel open for async response
});

console.log('[KeeGuard Offscreen] Ready — Argon2id + AES-GCM crypto available');
