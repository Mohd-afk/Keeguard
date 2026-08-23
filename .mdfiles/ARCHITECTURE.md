# 🏗️ Keeguard — Architecture & Directory Guide

> System architecture, module organization, application workflows, and technology stack breakdown.

---

## 💻 1. Technology Stack Breakdown

### Frontend (Web Layer)
- **Framework**: React 18.3 + Vite 6.4 (TypeScript)
- **Styling**: Tailwind CSS v4 + Figma SDS (Simple Design System) Tokens
- **Routing**: React Router 7 (`src/app/routes.ts`)
- **State Management**: Reactive In-Memory Stores (`store.ts`, `syncStore.ts`, `accessStore.ts`, `notificationsStore.ts`)
- **Local Persistence**: IndexedDB (`SecureVaultDB` via `src/app/idb.ts`)

### Cryptography & Security
- **Key Derivation**: Argon2id WASM (`hash-wasm`) — 64MB memory, 3 iterations
- **Symmetric Encryption**: AES-256-GCM (Web Crypto `crypto.subtle`)
- **Asymmetric Encryption**: ECDH (P-256 curve) for zero-knowledge collection sharing
- **Memory Safety**: `Uint8Array` byte buffer zeroing (`src/app/secureMemory.ts`)

### Native Layer (Android)
- **Runtime**: Capacitor 8.2 (`@capacitor/core`, `@capacitor/android`)
- **Autofill Provider**: Android Native Kotlin (`SecureVaultAutofillService.kt`)
- **Encrypted Local DB**: SQLCipher Room Database (`NativeVaultDatabase.kt`)
- **Hardware Security**: Android Keystore (`BiometricKeyManager.kt`, `DatabaseKeyManager.kt`)

### Backend & Cloud
- **Authentication**: Firebase Auth (Magic Link, Native Google Sign-In)
- **Database**: Cloud Firestore (Real-time `onSnapshot` subscriptions)
- **Storage & Hosting**: Firebase Hosting (OTA bundle distribution)

---

## 📁 2. Directory & File Structure Guide

```
Password Manager/
├── .mdfiles/                 # System reference specifications & guides
├── android/                  # Native Android wrapper project (Kotlin + Gradle)
│   └── app/src/main/java/com/mohdj/securevault/
│       ├── autofill/         # Android Autofill Service & Domain Matcher
│       ├── bridge/           # Capacitor Bridge Plugins (Vault, Biometrics)
│       ├── security/         # Android Keystore & SQLCipher key managers
│       └── vault/            # Room SQLCipher Database & DAOs
├── api/                      # Vercel serverless / Edge helper scripts
├── ota-updates/              # OTA update build archives & manifests
├── scripts/                  # Automated build, token sync, and OTA deployment scripts
│   ├── release-ota.mjs       # Automated OTA bundle builder & Firebase deployment
│   ├── tokens/               # Figma SDS token extractors
│   └── icons/                # Icon system builders
├── src/
│   ├── app/                  # Application Core & Domain Logic
│   │   ├── api/              # API callers (items, collections, etc.)
│   │   ├── auth/             # Firebase Auth wrapper & magic link handling
│   │   ├── crypto/           # AES-GCM, Argon2id, ECDH collection crypto
│   │   ├── firestore/        # Firestore references, queries, helpers
│   │   ├── hooks/            # Custom hooks (useSmartSearch, useSort, etc.)
│   │   ├── pages/            # Application Page views
│   │   ├── services/         # Device sessions, OTA updater, HIBP cache
│   │   ├── stores/           # Sub-stores (syncStore, accessStore, notificationsStore)
│   │   └── utils/            # Logger, password validation, rate limiting
│   ├── ui/                   # Figma SDS Component System
│   │   ├── compositions/     # Complex UI views (PasswordList, AddEditForm, Settings)
│   │   ├── hooks/            # UI utility hooks (use-mobile)
│   │   ├── icons/            # Icon component registry
│   │   ├── layout/           # AppShell, Sidebar, BottomNav, HomeWrapper
│   │   └── primitives/       # Atomic UI elements (button, input, dialog, card)
│   ├── tokens/               # Figma SDS Tokens (colors, spacing, typography)
│   ├── figma/                # Figma component mapping specifications
│   ├── App.tsx               # Root component & initializer
│   ├── main.tsx              # Application entry point
│   └── routes.ts             # React Router configuration
├── capacitor.config.ts       # Capacitor native bridge configuration
├── firebase.json             # Firebase Hosting & Firestore rules config
├── firestore.rules           # Security rules for Firestore collections
└── vite.config.ts            # Vite bundler & path alias configuration
```

---

## 🔄 3. Application Workflows

### A. Authentication & Key Derivation Flow
```
User Input (Email + Master Password)
  │
  ├──> Argon2id WASM (Salt: email) ─────────────> Auth Key ─────> Firebase Auth Sign-In
  │
  └──> Argon2id WASM (Salt: email + "vault") ───> Session DEK ──> Unlocks Local Vault
```

### B. Vault Real-Time Sync Flow
```
Local Vault Edit ──> AES-256-GCM Encrypt ──> Firestore Write
                                                │
Remote Client <── AES-256-GCM Decrypt <── onSnapshot Listener
```

### C. Self-Hosted OTA Deployment Flow
```
npm run release
  │
  ├──> 1. Vite Production Build (dist/)
  ├──> 2. Zip Archive Generation (`archiver`)
  ├──> 3. Upload to Firebase Hosting (`/ota-updates/bundles/*.zip`)
  └──> 4. Update Firestore `app_config/latest_version` Document
```

### D. Native Android Autofill Reverse Sync Flow
```
Autofill Service Save ──> SQLCipher Room DB ──> Capacitor Bridge ──> Web Vault Re-encrypt & Cloud Sync
```
