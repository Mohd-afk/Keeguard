// PURPOSE: Provides implementation and configuration for offscreen.js.
// Listen to messages from the service worker
window.addEventListener('message', async (event) => {
  // We can also use chrome.runtime.onMessage directly
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'DERIVE_KEYS') {
    deriveKeysArgon2(message.password, message.salt)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

async function deriveKeysArgon2(password, salt) {
  // Derive Auth Key: Argon2id(password, salt = email)
  // Derive Encryption Key: Argon2id(password, salt = email + "vault")
  
  const pwdBytes = new TextEncoder().encode(password);
  const authSaltBytes = new TextEncoder().encode(salt.toLowerCase().trim());
  const encSaltBytes = new TextEncoder().encode(salt.toLowerCase().trim() + 'vault');

  console.log('[Offscreen] Deriving Auth Key...');
  const authKeyBinary = await hashwasm.argon2id({
    password: pwdBytes,
    salt: authSaltBytes,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary'
  });

  // Convert Uint8Array to base64 to match the KeeGuard app's password derivation
  let bin = '';
  for (let i = 0; i < authKeyBinary.byteLength; i++) {
    bin += String.fromCharCode(authKeyBinary[i]);
  }
  const authKeyBase64 = btoa(bin);

  console.log('[Offscreen] Deriving Encryption Key...');
  const encryptionKeyHex = await hashwasm.argon2id({
    password: pwdBytes,
    salt: encSaltBytes,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'hex'
  });

  return {
    authKeyBase64,
    encryptionKeyHex
  };
}
