// PURPOSE: Browser extension background service worker handling vault-crypto.
let offscreenCreating = null;

async function setupOffscreenDocument(path) {
  // Check if offscreen document already exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (contexts.length > 0) {
    return;
  }

  // Create offscreen document
  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = chrome.offscreen.createDocument({
    url: path,
    reasons: ['DOM_PARSER'], // suitable reason
    justification: 'Argon2id key derivation using WebAssembly'
  });

  await offscreenCreating;
  offscreenCreating = null;
}

export async function deriveKeys(password, salt) {
  await setupOffscreenDocument('offscreen.html');
  
  let response = null;
  let lastError = null;
  
  // Retry messaging to account for offscreen document initialization time
  for (let i = 0; i < 10; i++) {
    try {
      response = await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'DERIVE_KEYS',
        password,
        salt
      });
      if (response) break;
    } catch (e) {
      lastError = e;
      // Wait 100ms before retrying
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (!response) {
    throw new Error('Failed to communicate with crypto offscreen document: ' + (lastError?.message || 'timeout'));
  }

  if (!response.success) {
    throw new Error(response.error || 'Failed to derive keys');
  }

  return {
    authKey: response.result.authKeyBase64,
    encryptionKeyHex: response.result.encryptionKeyHex
  };
}

export async function decryptVault(encryptedPayload, keyHex) {
  const rawKey = hexToBytes(keyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const iv = base64ToBytes(encryptedPayload.iv);
  const ciphertext = base64ToBytes(encryptedPayload.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function encryptVault(plaintext, keyHex) {
  const rawKey = hexToBytes(keyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv)
  };
}

// Helpers
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
