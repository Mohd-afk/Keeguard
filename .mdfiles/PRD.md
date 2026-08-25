<!-- PURPOSE: Documentation reference file for PRD. -->
# 📄 Keeguard — Product Requirement Document (PRD)

> **Keeguard** (Internal package: `com.mohdj.securevault`)  
> *Zero-Knowledge, Cross-Platform Password Manager & Digital Identity Safe*

---

## 🎯 1. Target Audience & Users
- **Security-Conscious Mobile/Web Users**: Require multi-device access without exposing secrets to cloud providers.
- **Privacy Advocates**: Demand client-side zero-knowledge encryption with memory-hard key derivation.
- **Power Users & Teams**: Need built-in TOTP authenticator, breach checks, CSV import/export, and zero-knowledge shared collections.

---

## 💡 2. Problem Statement
- **Centralized Cloud Vulnerabilities**: Traditional password managers store decryptable blobs or readable metadata online.
- **Complex Authenticator Workflows**: Users juggle separate apps for passwords, 2FA codes, and secure note sharing.
- **High Update Overhead**: Re-downloading massive APK files for minor feature patches degrades mobile user retention.

---

## 🔑 3. Key Product Requirements
- **Zero-Knowledge Architecture**: All encryption/decryption occurs on-device using AES-256-GCM. Cloud (Firebase) receives ciphertext only.
- **Hardware-Backed Biometric Lock**: Android Keystore integration allowing fingerprint/face unlock without storing raw passwords.
- **Android Native Autofill**: System-level autofill provider using encrypted SQLCipher database synced with web vault.
- **Built-in 2FA (TOTP)**: Isolated Argon2id subkey encryption for verification secrets.
- **Self-Hosted OTA Engine**: Silent, zero-cost over-the-air updates via `@capgo/capacitor-updater` & Firebase Hosting.
- **HIBP k-Anonymity Breach Auditing**: Localized password health diagnostics using SHA-1 range checks.
- **Shared Collections**: Zero-knowledge group category access using ECDH key pairs and envelope encryption.

---

## 🛠️ 4. Technology Stack & Rationale
| Layer | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 18 + Vite 6 + TS | Fast bundle generation, strict typing, SPA performance |
| **Design System** | Figma SDS + Tailwind v4 | Modular atomic design, consistent token design system |
| **Mobile Runtime** | Capacitor 8 + Android Kotlin | Native device features (Biometrics, SQLCipher Autofill) |
| **Backend & Cloud** | Firebase (Auth, Firestore, Hosting) | Real-time `onSnapshot` sync, zero-backend infrastructure cost |
| **Cryptography** | Web Crypto API + `hash-wasm` | Argon2id key derivation, AES-256-GCM, ECDH key exchange |
| **Storage Engine** | IndexedDB (`SecureVaultDB`) + SQLCipher | Async structured browser storage & encrypted native DB |
