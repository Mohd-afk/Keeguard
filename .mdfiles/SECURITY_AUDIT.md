# 🛡️ Keeguard — Security Architecture & Audit Report

> **Zero-Knowledge Threat Model, Cryptographic Controls & Audit Findings**

---

## 🔒 1. Security Architecture & Threat Model

### Cryptographic Controls
- **Key Derivation Function (KDF)**: Argon2id WASM (`hash-wasm`) using 64 MB RAM, 3 iterations, parallelism 1.
- **Symmetric Encryption**: AES-256-GCM via Web Crypto API (`crypto.subtle`) with unique 96-bit IV per write.
- **Dual Key Architecture**:
  - **Auth Key**: Derived from `email` + Master Password → sent to Firebase Auth.
  - **Encryption Key (DEK)**: Derived from `email + "vault"` + Master Password → stays strictly local in RAM/IndexedDB.
- **Shared Category Security**: ECDH (P-256 curve) key agreement with envelope encryption. Member removal triggers immediate key rotation & re-wrapping.
- **TOTP 2FA Isolation**: TOTP secrets encrypted with separate Argon2id subkey context.

### Memory & Native Security
- **RAM Hygiene**: Sensitive Uint8Array byte buffers scrubbed (`scrub()`) immediately after crypto operations.
- **Android Keystore**: DEK key wrapping backed by hardware TEE/StrongBox for biometric unlock.
- **Native SQLCipher**: Local Android autofill database encrypted with 256-bit AES key.
- **Screenshot Protection**: Android `FLAG_SECURE` window flag protection.

---

## 📋 2. Security Audit Summary

| Category | Finding / Threat | Mitigation Implemented | Status |
|---|---|---|---|
| **Auth** | Email enumeration attack | SHA-256 hashed lookup table in Firestore (`registered_emails/{hash}`) | ✅ PASS |
| **Crypto** | Weak PBKDF2 brute-force risk | Upgraded to memory-hard Argon2id WASM key derivation | ✅ PASS |
| **Database** | Plaintext cloud leak | AES-256-GCM client-side encryption; zero-knowledge Firestore rules | ✅ PASS |
| **Autofill** | Phishing via spoofed subdomains | Strict domain trust confidence calculation (min 0.8 score) | ✅ PASS |
| **Breach Check**| Plaintext password leak to API | HIBP k-Anonymity 5-character SHA-1 range queries with IDB caching | ✅ PASS |
| **Memory** | Secret leak via JS heap dump | `Uint8Array` byte buffer zero-filling (`secureMemory.ts`) | ✅ PASS |
