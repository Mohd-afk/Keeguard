// PURPOSE: Provides implementation and configuration for collectionCrypto.test.ts.
import { describe, it, expect } from 'vitest';
import {
  generateCollectionKey,
  generateDeviceKeyPair,
  exportPublicKeyAsBase64,
  importPublicKeyFromBase64,
  wrapCollectionKey,
  unwrapCollectionKey,
  encryptCollectionItemConsistent,
  decryptCollectionItem,
} from '../app/crypto/collectionCrypto';

describe('Collection Crypto - Zero Knowledge Key Domain', () => {
  it('should generate a valid 256-bit AES-GCM collection key', async () => {
    const key = await generateCollectionKey();
    expect(key).toBeDefined();
    expect(key.algorithm.name).toBe('AES-GCM');
    // @ts-ignore
    expect(key.algorithm.length).toBe(256);
    expect(key.extractable).toBe(true);
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  it('should generate, export, and import ECDH P-256 device key pairs correctly', async () => {
    const { publicKeyB64, privateKey } = await generateDeviceKeyPair();

    expect(publicKeyB64).toBeDefined();
    expect(typeof publicKeyB64).toBe('string');
    expect(privateKey).toBeDefined();
    expect(privateKey.algorithm.name).toBe('ECDH');
    // @ts-ignore
    expect(privateKey.algorithm.namedCurve).toBe('P-256');

    // Test import/export of public key
    const importedPubKey = await importPublicKeyFromBase64(publicKeyB64);
    expect(importedPubKey).toBeDefined();
    expect(importedPubKey.algorithm.name).toBe('ECDH');
    // @ts-ignore
    expect(importedPubKey.algorithm.namedCurve).toBe('P-256');

    const exportedPubKeyB64 = await exportPublicKeyAsBase64(importedPubKey);
    expect(exportedPubKeyB64).toBe(publicKeyB64);
  });

  it('should perform P-256 ECDH + AES-KW wrapping and unwrapping successfully', async () => {
    // 1. Generate keys for two separate devices (Alice and Bob)
    const aliceKeys = await generateDeviceKeyPair();
    const bobKeys = await generateDeviceKeyPair();

    // 2. Generate a random collection key
    const collectionKey = await generateCollectionKey();

    // 3. Alice wraps the collection key for Bob using Bob's public key
    const wrappedKeyB64 = await wrapCollectionKey(
      collectionKey,
      aliceKeys.privateKey,
      bobKeys.publicKeyB64
    );

    expect(wrappedKeyB64).toBeDefined();
    expect(typeof wrappedKeyB64).toBe('string');

    // 4. Bob unwraps the collection key using Alice's public key
    const unwrappedKey = await unwrapCollectionKey(
      wrappedKeyB64,
      bobKeys.privateKey,
      aliceKeys.publicKeyB64,
      'test-collection-id',
      1 // key version
    );

    expect(unwrappedKey).toBeDefined();
    expect(unwrappedKey.algorithm.name).toBe('AES-GCM');
    // @ts-ignore
    expect(unwrappedKey.algorithm.length).toBe(256);

    // 5. Verify the unwrapped key matches (can be used to encrypt/decrypt)
    const plaintext = 'Secret password material';
    const title = 'Vault Credentials';

    const { payload, envelope } = await encryptCollectionItemConsistent(
      plaintext,
      title,
      collectionKey,
      'test-collection-id'
    );

    const decrypted = await decryptCollectionItem(
      payload,
      envelope.wrapped_item_key,
      unwrappedKey
    );

    expect(decrypted.plaintext).toBe(plaintext);
    expect(decrypted.title).toBe(title);
  });

  it('should encrypt and decrypt collection items with consistent title IV derivation', async () => {
    const collectionKey = await generateCollectionKey();
    const plaintext = 'MyPassword123!';
    const title = 'Google Workspace';

    // Encrypt
    const { payload, envelope } = await encryptCollectionItemConsistent(
      plaintext,
      title,
      collectionKey,
      'collection-123'
    );

    expect(payload.ciphertext).toBeDefined();
    expect(payload.iv).toBeDefined();
    expect(payload.auth_tag).toBeDefined();
    expect(payload.title_enc).toBeDefined();
    expect(envelope.wrapped_item_key).toBeDefined();
    expect(envelope.wrapped_for_id).toBe('collection-123');

    // Decrypt
    const decrypted = await decryptCollectionItem(
      payload,
      envelope.wrapped_item_key,
      collectionKey
    );

    expect(decrypted.plaintext).toBe(plaintext);
    expect(decrypted.title).toBe(title);
  });
});
