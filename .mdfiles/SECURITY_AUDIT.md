<!-- PURPOSE: Master Security Architecture and Zero-Knowledge Threat Model specification. -->
# 🛡️ Keeguard — Master Security Architecture & Threat Model

> **Public Security Architecture, Zero-Knowledge Cryptographic Controls & Threat Model**  
> *Target System: Keeguard (SecureVault) Zero-Knowledge Password Manager*

---

## 🧭 Executive Summary & Security Philosophy

Keeguard is built on a strict **Zero-Knowledge Architecture**. Neither server administrators, cloud providers, nor third-party services can access user vault contents, master passwords, or unencrypted credential keys.

---

## 🏛️ Security Architecture Gates

```
                    ┌────────────────────────────────────────┐
                    │    KEEGUARD MASTER SECURITY AUDIT      │
                    └───────────────────┬────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
  GATE 1: REPOSITORY &           GATE 2: APPLICATION &           GATE 3: CRYPTOGRAPHIC
     SUPPLY CHAIN                  RUNTIME SECURITY               ZERO-KNOWLEDGE
  (Scorecard, Gitleaks,           (Android MSTG, Firestore        (Argon2id, AES-256-GCM,
   Dependabot, OpenSSF)            Rules, FLAG_SECURE, CSP)        Client-Side Key Scrubbing)
```

---

## ⚔️ Security Controls Across Attack Surfaces

### 🎯 Surface 1: Source Code & Cryptography Engine
- **Key Derivation (KDF)**: Argon2id WASM (`hash-wasm`) configured with 64 MB RAM, 3 iterations, parallelism 1 to protect against GPU/ASIC dictionary attacks.
- **AES-256-GCM Encryption**: Every vault item uses an independent 96-bit cryptographically random IV (`crypto.getRandomValues`).
- **Dual Key Architecture**: Auth key (`email` + Master Password) is sent to Firebase Auth; Encryption Key (DEK) stays strictly in client RAM/IndexedDB.
- **Memory Scrubbing**: `Uint8Array` key buffers are zeroed out via `scrub()` ([`src/app/secureMemory.ts`](file:///d:/PYTHON/Password%20Manager/src/app/secureMemory.ts)) immediately after use.

---

### 🎯 Surface 2: Secret Governance & Commit Protection
- **Pre-Commit Secret Scanning**: [`scripts/pre-commit-secret-scan.mjs`](file:///d:/PYTHON/Password%20Manager/scripts/pre-commit-secret-scan.mjs) blocks commits containing API keys or private keys.
- **Automated Gitleaks CI**: [`.github/workflows/ci.yml`](file:///d:/PYTHON/Password%20Manager/.github/workflows/ci.yml) runs Gitleaks secret detection on all pushes.
- **Git History Hygiene**: Environment variables and service account keys are strictly git-ignored in [`.gitignore`](file:///d:/PYTHON/Password%20Manager/.gitignore).

---

### 🎯 Surface 3: CI/CD Infrastructure
- **Least-Privilege Permissions**: All workflows enforce top-level `permissions: read-all`.
- **Immutable Action Version Pinning**: All third-party actions are pinned to full 40-character commit SHAs.
- **OpenSSF Scorecard**: Automated security analysis integrated in [`.github/workflows/ci.yml`](file:///d:/PYTHON/Password%20Manager/.github/workflows/ci.yml).

---

### 🎯 Surface 4: Mobile & Native Android Environment
- **ADB Backup Disabled**: `android:allowBackup="false"` in [`AndroidManifest.xml`](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml).
- **Screen Protection**: Enforced `FLAG_SECURE` in [`MainActivity.kt`](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/MainActivity.kt) to block screenshots and task-switcher previews.
- **Native Vault Database**: SQLCipher Room database encrypted with 256-bit key backed by Android Keystore TEE / Biometric prompt.
- **Autofill Verification**: Android Autofill service matches target package names and web domains with strict confidence thresholds (score >= 0.8).

---

### 🎯 Surface 5: Cloud & Backend Infrastructure
- **Zero-Knowledge Cloud Storage**: Firestore holds only AES-256-GCM ciphertexts.
- **Strict Security Rules**: [`firestore.rules`](file:///d:/PYTHON/Password%20Manager/firestore.rules) restrict user document reads/writes strictly to `request.auth.uid == userId`.
- **Vulnerability Reporting Policy**: Defined in [`SECURITY.md`](file:///d:/PYTHON/Password%20Manager/SECURITY.md).

---

### 🎯 Surface 6: Supply Chain & Build Artifact Integrity
- **Dependabot Updates**: Automated weekly updates via [`.github/dependabot.yml`](file:///d:/PYTHON/Password%20Manager/.github/dependabot.yml).
- **CodeQL SAST Analysis**: Automated code scanning via [`.github/workflows/ci.yml`](file:///d:/PYTHON/Password%20Manager/.github/workflows/ci.yml).
- **OTA Bundle Checksums**: Updates are zip-packaged, SHA-256 hashed, and validated prior to execution.

---

## 📊 Security Controls Matrix

| Category | Security Vector | Mitigation & Control | Status |
| :--- | :--- | :--- | :---: |
| **Auth** | Email enumeration | SHA-256 lookup mapping in Firestore | ✅ ENFORCED |
| **Crypto** | Brute-force attacks | Memory-hard Argon2id key derivation | ✅ ENFORCED |
| **Storage** | Cloud plain-text leak | AES-256-GCM client-side zero-knowledge | ✅ ENFORCED |
| **Mobile** | Screenshot / Task-switcher leak | Android `FLAG_SECURE` window enforcement | ✅ ENFORCED |
| **Mobile** | ADB backup extraction | `android:allowBackup="false"` in manifest | ✅ ENFORCED |
| **Autofill** | Phishing / Subdomain spoof | Strict domain trust confidence (>= 0.8) | ✅ ENFORCED |
| **CI/CD** | Action token hijack | `permissions: read-all` & 40-char SHA pins | ✅ ENFORCED |
| **Secrets** | Leaked API credentials | Gitleaks CI + local pre-commit scanner | ✅ ENFORCED |
| **Memory** | RAM dump key recovery | `Uint8Array` byte zeroing (`scrub()`) | ✅ ENFORCED |

---

*Verified & Enforced via `npm test`.*
