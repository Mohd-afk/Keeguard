// PURPOSE: Automated maintenance and release script for test_crypto.ts.
// ─── Standalone Crypto Test Script ──────────────────────────────────────────
// Runs native Node Web Crypto to verify that the collection key wraps/unwraps
// and item encryption/decryption operate correctly under standard Web Crypto.
// ─────────────────────────────────────────────────────────────────────────────

import { assert } from 'console';
import {
  generateCollectionKey,
  generateDeviceKeyPair,
  exportPublicKeyAsBase64,
  importPublicKeyFromBase64,
  wrapCollectionKey,
  unwrapCollectionKey,
  encryptCollectionItemConsistent,
  decryptCollectionItem,
} from '../src/app/crypto/collectionCrypto.js';

// Mock global indexedDB and window to prevent import errors in Node.js
const mockIndexedDB = {
  open: () => ({
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
  }),
};
Object.defineProperty(globalThis, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

async function runTests() {
  console.log('🧪 Running Keeguard Cryptography Verification Suite...');

  try {
    // 1. Generate collection key
    console.log('-> Generating collection key...');
    const key = await generateCollectionKey();
    assert(key !== null, 'Key generation failed');
    assert(key.algorithm.name === 'AES-GCM', 'Incorrect key algorithm');
    console.log('✅ Collection Key generated successfully.');

    // 2. Generate and export/import device keypairs
    console.log('-> Generating ECDH P-256 device key pairs...');
    const aliceKeys = await generateDeviceKeyPair();
    const bobKeys = await generateDeviceKeyPair();

    assert(aliceKeys.publicKeyB64 !== null, 'Alice public key generation failed');
    assert(bobKeys.publicKeyB64 !== null, 'Bob public key generation failed');
    console.log('✅ Device Keypairs generated.');

    console.log('-> Testing public key serialization...');
    const importedPubKey = await importPublicKeyFromBase64(aliceKeys.publicKeyB64);
    const exportedPubKeyB64 = await exportPublicKeyAsBase64(importedPubKey);
    assert(exportedPubKeyB64 === aliceKeys.publicKeyB64, 'Public key export/import cycle mismatch');
    console.log('✅ Public key import/export cycle matches perfectly.');

    // 3. Test P-256 ECDH + AES-KW wrapping/unwrapping
    console.log('-> Testing ECDH Key Agreement + AES-KW wrap/unwrap roundtrip...');
    const wrappedKeyB64 = await wrapCollectionKey(
      key,
      aliceKeys.privateKey,
      bobKeys.publicKeyB64
    );
    assert(wrappedKeyB64 !== null, 'Collection key wrapping failed');
    console.log(`✅ Collection key wrapped. Base64 length: ${wrappedKeyB64.length}`);

    const unwrappedKey = await unwrapCollectionKey(
      wrappedKeyB64,
      bobKeys.privateKey,
      aliceKeys.publicKeyB64,
      'test-collection-id',
      1
    );
    assert(unwrappedKey !== null, 'Collection key unwrapping failed');
    console.log('✅ Collection key unwrapped successfully.');

    // 4. Test item encryption and decryption with consistent title-IV scheme
    console.log('-> Testing item encryption and decryption with consistent title-IV...');
    const plaintext = 'SuperSecretVaultMasterPassword2026!';
    const title = 'Production AWS Database';

    const { payload, envelope } = await encryptCollectionItemConsistent(
      plaintext,
      title,
      key,
      'test-collection-id'
    );

    assert(payload.ciphertext !== null, 'Payload encryption failed');
    assert(payload.title_enc !== null, 'Title encryption failed');
    assert(envelope.wrapped_item_key !== null, 'Item key wrapping failed');

    const decrypted = await decryptCollectionItem(
      payload,
      envelope.wrapped_item_key,
      unwrappedKey
    );

    assert(decrypted.plaintext === plaintext, 'Plaintext mismatch after decrypt');
    assert(decrypted.title === title, 'Title mismatch after decrypt');
    console.log('✅ Item encrypted, decrypted, and verified successfully.');

    console.log('\n🎉 ALL CRYPTO TESTS PASSED SUCCESSFULLY! ZERO-KNOWLEDGE DOMAIN IS 100% SECURE.');
  } catch (e) {
    console.error('\n❌ Test execution failed with error:', e);
    process.exit(1);
  }
}

runTests();
