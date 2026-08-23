# Keeguard — Feature & Architecture Documentation

> **Branding alias:** This app was previously called **SecureVault** and is now called **Keeguard**. `Keeguard` = `SecureVault` — they are the **same app**, just old vs. new name. Internal identifiers (package `com.mohdj.securevault`, storage keys `securevault_*`) keep the old name intentionally to protect existing user data.

> **Last Updated:** 2026-08-22  
> **Current Version:** 5.0.3  
> **Repository:** Mohd-afk/securevault-app  
> **Stack:** React 18 · Vite · Capacitor (Android) · Firebase (Auth, Firestore) · Kotlin (Native)

This document is the **single source of truth** for every feature, technical decision, and architectural evolution in the Keeguard project.

---

## Table of Contents

1. [Categorized Feature Matrix](#1-categorized-feature-matrix)
   - [1.1 Basic Features](#11-basic-features)
   - [1.2 Extra Features](#12-extra-features)
   - [1.3 USP (Unique Selling Proposition) Features](#13-usp-unique-selling-proposition-features)
2. [User Features Deep Dive](#2-user-features-deep-dive)
3. [Developer / System Features](#3-developer--system-features)
4. [Technical & Architectural Evolution](#4-technical--architectural-evolution)
5. [Maintenance Guide](#5-maintenance-guide)

---

## 1. Categorized Feature Matrix

### 1.1 Basic Features
- **Master Password & Vault Setup**: Real-time password strength validation and zero-knowledge vault setup.
- **Authentication**: Passwordless Email (Magic Link) and Google Sign-In via native Capacitor auth.
- **Password Vault (CRUD)**: Create, read, update, soft-delete credentials across multiple categories (Website, App, Card, etc.).
- **Password Generator**: Cryptographically secure random password generation with customizable pool sets.
- **Auto-Lock Timeout**: Idle timeout auto-locking (1, 2, 5, 15, 30 min, Never) and background lock protection.
- **Trash Bin**: Soft-delete staging area with 30-day automatic purge.
- **Password Strength Indicator**: Real-time validation during setup and password modification.

### 1.2 Extra Features
- **CSV Import & Export**: Import from Chrome/Bitwarden/LastPass with auto-column mapping and duplicate resolution; export active items to CSV.
- **Favorites (★) System**: Star vault items for quick one-tap header filtering.
- **Category Chips Filter**: Horizontal scrollable header tags (`All`, `Codes`, `Passkeys`, `Cards`, `Notes`).
- **Sidebar Navigation Drawer**: Animated slide-out navigation with live category count badges.
- **Smart Fuzzy Search**: Tokenized multi-field search (`useSmartSearch`) across title, URL, and username.
- **Multi-Criteria Sorting**: Custom sorting (`useSort`) by title, creation date, modification date, or item size.
- **Active Device Management**: View active sessions with IP geolocation, user-agent parsing, and remote device revocation.
- **Username System**: Atomic availability checks and claiming for unique `@username` identifiers.
- **In-App Feedback Form**: Integrated Fillout form with automated context attachment.
- **Screenshot Protection**: Toggleable window protection (`FLAG_SECURE`) on Android devices.
- **Legal & License Pages**: Embedded Privacy Policy, Terms of Service, and License Agreement views.

### 1.3 USP (Unique Selling Proposition) Features
- **Zero-Knowledge Shared Collections**: Group category sharing using ECDH key pairs and envelope re-wrapping on member removal.
- **Android Native SQLCipher Autofill**: Android system autofill provider with reverse sync between web vault and native SQLCipher Room database.
- **Hardware-Backed Biometric Unlock**: Android Keystore integration wrapping Data Encryption Keys (DEK) for instant fingerprint/face unlock.
- **Argon2id WASM Key Derivation**: Memory-hard WASM key derivation (64MB memory, 3 iterations) replacing legacy PBKDF2.
- **HIBP k-Anonymity Breach Auditor**: Client-side password breach checking using 5-character SHA-1 range queries with IndexedDB local caching.
- **TOTP 2FA Secret Cryptographic Isolation**: Built-in 2FA code generator with Argon2id subkey isolation protecting 2FA secrets from password compromise.
- **Silent Self-Hosted OTA Update Engine**: Instant over-the-air bundle delivery via `@capgo/capacitor-updater` with multi-state rollback protection.
- **Strict RAM Memory Scrubbing**: Manual `Uint8Array` buffer zeroing (`scrub()`) after cryptographic operations to mitigate RAM dumps.

---

## 2. User Features Deep Dive

### 2.1 Master Password & Vault Setup
**Description:** On first login, users create a master password that encrypts their entire vault. The password undergoes strength validation before acceptance.
- **Key Files:** `LockScreen.tsx`, `store.ts` (`setupInitialVault`, `verifyMasterPassword`)

### 2.2 Authentication (Email + Google Sign-In)
**Description:** Passwordless Email magic link sign-in and Google Sign-In handled natively via `@capacitor-firebase/authentication`.
- **Key Files:** `auth.ts`, `AuthScreen.tsx`

### 2.3 Password Vault (CRUD)
**Description:** Create, read, update, and soft-delete vault items (Title, Username, Password, URL, Category, Notes, TOTP secret).
- **Key Files:** `store.ts`, `PasswordList.tsx`, `AddEditForm.tsx`, `ItemDetail.tsx`

### 2.4 Trash Bin
**Description:** Soft-deleted items marked with `deletedAt` are stored in the Trash Bin and auto-purged after 30 days.
- **Key Files:** `TrashBin.tsx`, `store.ts` (`deleteVaultItem`, `restoreVaultItem`, `permanentlyDeleteVaultItem`)

### 2.5 CSV Import & Export
**Description:** Full importer with column auto-mapping and duplicate resolution; export active vault entries to encrypted or standard CSV.
- **Key Files:** `Settings.tsx`, `store.ts` (`bulkAddVaultItems`, `exportVaultItemsAsCsv`)

### 2.6 Active Device Management
**Description:** View logged-in sessions, IP-based geolocation, and revoke individual or all remote device tokens.
- **Key Files:** `services/deviceSession.ts`, `Settings.tsx`

### 2.7 Android Native Autofill Service
**Description:** Android Autofill service with SQLCipher database integration and automated web ↔ native reverse sync.
- **Key Files:** `autofill/SecureVaultAutofillService.kt`, `autofill/AutofillHelper.kt`, `bridge/VaultBridgePlugin.kt`

### 2.8 Biometric Unlock
**Description:** Hardware Android Keystore DEK wrapping for fingerprint/face authentication auto-prompts on lock screen.
- **Key Files:** `LockScreen.tsx`, `Settings.tsx`, `store.ts`, `BiometricBridgePlugin.kt`

### 2.9 Security Health Dashboard & HIBP Checker
**Description:** Diagnostic panel checking weak/reused passwords and querying HIBP API using k-Anonymity.
- **Key Files:** `SecurityDashboard.tsx`, `services/hibpCache.ts`

---

## 3. Developer / System Features

### 3.1 Structured Logging System
Namespace-aware logging (`createLogger`) with color-coded console logs for `AUTH`, `STORE`, `FIRESTORE`, `CRYPTO`, `UI`, `SYNC`, `SETTINGS`.

### 3.2 Real-Time Cloud Sync
Real-time Firestore `onSnapshot` subscriptions with echo-back write suppression and automatic IndexedDB caching.

### 3.3 Zero-Knowledge Shared Collections
Group category sharing using ECDH key pairs, envelope key distribution, and automatic key rotation on member removal.

### 3.4 Self-Hosted OTA Update System
Zero-cost silent OTA update engine using `@capgo/capacitor-updater` with Firebase Hosting CDN, SHA-256 verification, and 3-state boot protection.

---

## 4. Technical & Architectural Evolution

| Aspect | Initial | Current |
|---|---|---|
| **Key Derivation** | PBKDF2 (SHA-256, 600K iter) | Argon2id WASM (64MB memory, 3 iter) |
| **Storage Engine** | `localStorage` | IndexedDB (`SecureVaultDB`) + SQLCipher |
| **Encryption** | AES-256-GCM | AES-256-GCM + Argon2id Dual Key |
| **UI System** | Ad-hoc CSS | Figma SDS (Simple Design System) + Tailwind v4 |

---

## 5. Maintenance Guide
Whenever new features or technical updates are implemented, update section 1 matrix (Basic, Extra, USP) and add deep-dive entries to section 2/3.
