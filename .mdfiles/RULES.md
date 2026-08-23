# 📜 Keeguard — System & Workflow Rules

> **Mandatory Guidelines for AI Agents & Developers**  
> *These rules must be obeyed without exception on every task, edit, and release.*

---

## 🐴 1. The Ponytail Rules (Code Optimization & Reduction)

> *"The best code is the code you never wrote."*

1. **Check the Decision Ladder Before Writing Code**:
   - `1. YAGNI` → Does this feature/fix actually need to exist?
   - `2. REUSE` → Is there an existing helper, hook, store, or util?
   - `3. STD LIB` → Can Web Crypto, Fetch, or native JS platform API solve it directly?
   - `4. EXISTING DEP` → Can an installed `package.json` library handle it?
   - `5. ONE-LINER` → Can it be written in a single expression?
   - `6. MINIMAL` → Write the absolute smallest implementation possible.

2. **Strict Codebase Constraints**:
   - **No Inline Firestore Paths**: All paths live in ref-builder functions (`src/app/firestore/`).
   - **No New Dependencies**: Do NOT add npm packages for platform capabilities (`crypto.subtle` > `bcrypt`).
   - **Rule of Three**: Extract helpers only when a pattern is repeated 3 or more times.
   - **Use Firestore Helpers**: Always use `getDocOrNull()`, `snapsToDocs()`, and `querySnapshotWith()`.
   - **No Raw Logs**: Replace `console.log` with `createLogger()` from `src/app/utils/logger.ts`.
   - **Path Aliases**: Always use `@/app` and `@/ui` path aliases — relative paths (`../`) are banned in `src/ui/compositions/`.

---

## 🚀 2. Mandatory Release & Deployment Rules

### Rule 2.1 — OTA Release Workflow
- **Rule**: **AFTER EVERY OTA RELEASE, YOU MUST IMMEDIATELY PUSH THE CODE TO GITHUB.**
- **Workflow**:
  1. Run `npm run build` & verify 0 TypeScript errors (`npx tsc --noEmit`).
  2. Run `npm run release` (builds OTA zip, uploads to Firebase Hosting, updates Firestore manifest).
  3. **IMMEDIATELY** execute `git add .`, `git commit -m "release: ota update vX.X.X"`, and `git push origin main`.

### Rule 2.2 — APK Download Update Workflow
- **Rule**: **BEFORE EVERY NATIVE APK DOWNLOAD RELEASE, YOU MUST INCREMENT THE RELEASE VERSION BY AT LEAST ONE STEP.**
- **Files to update on APK release**:
  - `package.json` → increment `version` (e.g. `4.0.0` → `4.0.1` or `5.0.0`).
  - `android/app/build.gradle` → increment `versionCode` (+1) and `versionName`.
  - Firestore `app_config/latest_version` → update `min_apk_version`.
- **Workflow**:
  1. Bump version numbers in `package.json` and `build.gradle`.
  2. Run native Android build / APK export.
  3. Push update manifest to Firestore.
  4. **IMMEDIATELY** commit and push changes to GitHub.

---

## 🛡️ 3. Error Handling & Architectural Boundaries

1. **Crypto Hard Boundaries**:
   - **NEVER** alter key derivation (Argon2id) or encryption (AES-256-GCM) parameters without explicit user authorization.
   - **NEVER** log raw master passwords, DEK keys, or plaintext vault items.

2. **Auth & Firestore Security Rules**:
   - **NEVER** bypass auth state validation (`getCurrentUser()`) before initiating database operations.
   - All client reads must enforce zero-knowledge handling — decryption happens strictly on the client.

3. **Autofill & Native Bridge Safety**:
   - Always verify domain match confidence before autofilling credentials in Android WebView / apps.
   - Never expose unencrypted SQLCipher keys to external intents or logcat outputs.

4. **UI & Design Boundaries**:
   - Strictly follow **Figma SDS** tokens (`src/tokens/`) and CSS variable classes.
   - Banned: inline hardcoded Hex colors where design system color variables exist.

---

## 🚨 4. Known Pitfalls & Common Errors

### Error: `[Firebase] Auth not initialized. Call initFirebase() first.` (React White Screen of Death)
- **Cause 1**: Vercel/Production deployment does not have the `VITE_FIREBASE_*` environment variables loaded, causing initialization to fail.
- **Cause 2**: Fast-Refresh / HMR (Hot Module Replacement) causes `firebase.ts` state to clear, but Firebase's global registry retains the app. `initializeApp()` throws a `duplicate-app` error, causing `_auth` to remain null.
- **Why it crashes**: When `initFirebase()` fails or times out in `App.tsx`, it throws an error. If that error is swallowed, `App.tsx` sets `bootComplete(true)` and renders the routing tree. The UI then invokes `getFirebaseAuth()` (e.g. inside `AppShell`'s `useEffect`), which throws synchronously because `_auth` is null.
- **Prevention Rule**: 
  1. **NEVER** silently swallow `initFirebase()` errors in `App.tsx`. Always call `setBootError()` to freeze the UI gracefully.
  2. Always check `if (getApps().length > 0) { _app = getApp(); }` instead of blindly calling `initializeApp()` in `firebase.ts`.
  3. **NEVER** call `getFirebaseAuth()`, `getFirebaseDb()`, or `getFirebaseApp()` at the top-level scope of ANY module (during file import).
