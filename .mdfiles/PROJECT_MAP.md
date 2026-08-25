<!-- PURPOSE: Documentation reference file for PROJECT_MAP. -->
# 🗺️ Keeguard — Project Map & Subsystem Index

> **Low-Token Navigation Map for AI Coding Agents**  
> *Locate target files and documentation instantly without reading the entire repository.*

---

## 🧭 Subsystem Map & Key Entry Points

```
Subsystem                 Main Directory / Files                                Key Doc File
────────────────────────  ────────────────────────────────────────────────────  ─────────────────────────
1. Cryptography Engine    src/app/crypto.ts, src/app/crypto/*                  .mdfiles/ARCHITECTURE.md
2. Store & Business       src/app/store.ts, src/app/stores/*, idb.ts           .mdfiles/FEATURES.md
3. Database Layer         src/app/firestore.ts, src/app/firestore/*            .mdfiles/ARCHITECTURE.md
4. Figma SDS UI System    src/ui/primitives/, compositions/, layout/, tokens/  .mdfiles/DESIGN.md
5. Android Native         android/app/src/main/java/.../autofill/, bridge/    .mdfiles/ARCHITECTURE.md
6. OTA Release Pipeline   scripts/release-ota.mjs, src/app/services/updater.ts .mdfiles/RELEASES.md
```

---

## 📂 Codebase File Index

### Core Application (`src/app/`)
- `App.tsx`: Main React entry, layout shell, global state initialization.
- `store.ts`: Reactive state store (vault CRUD, master password, settings, export/import).
- `crypto.ts`: Argon2id key derivation, AES-256-GCM encryption/decryption routines.
- `firestore.ts`: Cloud Firestore refs, `onSnapshot` real-time synchronization, user profile management.
- `auth.ts`: Firebase Auth integration (Magic link, native Google sign-in).
- `idb.ts`: Async IndexedDB storage wrapper (`SecureVaultDB`).
- `secureMemory.ts`: Sensitive `Uint8Array` buffer zeroing helper (`scrub()`).
- `services/updater.ts`: OTA update background checker & bundle verification.
- `services/deviceSession.ts`: Device session tracking, IP geolocation, session revocation.
- `services/hibpCache.ts`: Local k-Anonymity breach audit cache using HIBP API range checks.

### Figma SDS UI Layer (`src/ui/`)
- `primitives/`: Low-level Radix UI / Tailwind atomic components (button, input, card, dialog, sheet).
- `layout/`: AppShell, Sidebar, BottomNav, HomeWrapper.
- `compositions/`: Screen views (PasswordList, AddEditForm, Settings, ItemDetail, SecurityDashboard).
- `icons/`: Category and UI icon component map.

### Design System Tokens (`src/tokens/`)
- `colors.ts`: Primary cyan/accent/dark background palette.
- `spacing.ts`: Spacing scale (1-12) and border radii (sm to 2xl).
- `typography.ts`: Inter sans & JetBrains Mono typography scales.

### Native Android Layer (`android/`)
- `autofill/SecureVaultAutofillService.kt`: Android native Autofill Service provider.
- `security/BiometricKeyManager.kt`: Android Keystore biometric DEK key wrapper.
- `vault/NativeVaultDatabase.kt`: SQLCipher Room database for native autofill storage.
- `bridge/VaultBridgePlugin.kt`: Capacitor JS-to-Native bridge.

---

## 🛠️ Automated Verification Script
Run `npm run doc:check` (`node scripts/verify-docs.mjs`) to verify doc freshness against uncommitted code changes.
