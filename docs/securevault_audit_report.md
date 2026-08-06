# 🛡️ SecureVault (Keeguard) — Full Security Audit Report

> **Audited by:** Antigravity AI  
> **Date:** 2026-07-23  
> **App Version:** 5.0.1  
> **Stack:** React 18 + Vite + Capacitor 8 + Firebase (Firestore + Auth + Functions)  
> **Files read:** `crypto.ts`, `secureMemory.ts`, `auth.ts`, `firebase.ts`, `store.ts` (1810 lines), `idb.ts`, `firestore.rules`, `AndroidManifest.xml`, `capacitor.config.ts`, `config.xml`, `logger.ts`, `functions/src/**`, `collectionCrypto.ts`, `package.json`

---

## Severity Legend

| Symbol | Level | Meaning |
|---|---|---|
| 🔴 | **Critical** | Immediate data breach or takeover risk |
| 🟠 | **High** | Serious risk, fix before any real users |
| 🟡 | **Medium** | Notable weakness, fix in next sprint |
| 🔵 | **Low** | Minor or defence-in-depth improvement |
| ✅ | **Pass** | Good security practice, noted for confidence |

---

## Layer 1 — Cryptography (`crypto.ts`, `secureMemory.ts`, `collectionCrypto.ts`)

### ✅ PASS — Argon2id with strong parameters
- Memory: 64 MB, iterations: 3, parallelism: 1 — this is solid, OWASP-compliant KDF.  
- Using **AES-256-GCM** with a **per-encryption random IV** via `crypto.getRandomValues` — correct.
- Keys are marked `extractable: false` in WebCrypto — cannot be read back from the CryptoKey object. ✅
- Key material is scrubbed with `buffer.fill(0)` after use — best practice. ✅
- TOTP key uses a **separate Argon2id context** (salt: `email + "totp"` vs `email + "vault"`) — excellent design, means vault leak ≠ TOTP leak. ✅
- ECDH P-256 + AES-KW for collection key wrapping — correct approach. ✅

### 🟡 MEDIUM — Salt is weak: `email` string, not a random salt
**File:** [`crypto.ts` L97, L115, L150](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#L94-L115)
```
deriveAuthKey  → salt = email.toLowerCase().trim()
deriveEncKey   → salt = email.toLowerCase().trim() + "vault"
deriveTotpKey  → salt = email.toLowerCase().trim() + "totp"
```
**Issue:** Argon2id's salt is supposed to be a **random, unique, per-user value stored alongside the hash**. Using the email as a salt means:
- Two users with the same password but different emails will produce different keys (good), BUT
- The same user will always produce the **same key** for the same password (expected in this design, but means a pre-computation dictionary attack targeted at known emails is possible).
- More importantly, if an attacker knows your email and password, they can derive your exact vault key — no stored salt needed to verify.

**Context:** This is a deliberate architectural choice for a **zero-knowledge** design (the server never sees the key, and the client doesn't need to fetch a salt). It's not broken — Bitwarden-style apps do this (they call it "password hashing" with the email as salt). But document this explicitly so no future dev accidentally tries to "add a real salt."

**Fix (if you want stronger):** Add a per-user random 16-byte salt stored encrypted in Firestore. On first setup, generate random salt, store it. On every login, fetch the salt first, then derive key. This is how 1Password v8 does it.

---

### 🟡 MEDIUM — `toBase64` uses spread operator on potentially large buffers
**File:** [`crypto.ts` L25](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#L24-L26)
```ts
return btoa(String.fromCharCode(...new Uint8Array(buffer)));
```
**Issue:** `String.fromCharCode(...largeArray)` causes a **stack overflow** on very large buffers because spread (`...`) puts all elements on the call stack. For vault payloads with thousands of passwords, this can crash.

**Fix:**
```ts
export function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```

---

### 🔵 LOW — `scrub()` doesn't guarantee memory erasure in JS
**File:** [`secureMemory.ts` L24](file:///d:/PYTHON/Password%20Manager/src/app/secureMemory.ts#L24-L27)
```ts
export function scrub(buffer: Uint8Array): void {
  buffer.fill(0);
}
```
**Issue:** The comment is correct — the GC may have already copied the buffer elsewhere. However `buffer.fill(0)` is still a meaningful best-effort. The real risk is the original **string** password (`masterPassword: string`) which exists in JS string intern pool and **cannot be zeroed**. String primitives are immutable in JS.

**Fix:** This is a fundamental JS limitation. Document it explicitly. Consider accepting password as `Uint8Array` from the UI layer directly (using `TextEncoder` at the input boundary) rather than as a string. Currently `passwordToBytes()` is called at the start of each function which is the right call — just note this limitation clearly in the README/threat model.

---

## Layer 2 — Authentication (`auth.ts`)

### ✅ PASS — Google Sign-In correctly uses native Credential Manager on Android
Native path → `FirebaseAuthentication.signInWithGoogle()` → native Google SDK → no webview OAuth. ✅

### 🟡 MEDIUM — Email stored in `localStorage` during passwordless sign-in
**File:** [`auth.ts` L43, L55](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#L43-L65)
```ts
window.localStorage.setItem('emailForSignIn', email);  // L43
let email = window.localStorage.getItem('emailForSignIn');  // L55
```
**Issue:** On Android/Capacitor, `localStorage` in a WebView is world-readable by any JavaScript running in the same WebView context, and may persist across unexpected states. For a passwordless email link flow this is standard Firebase behavior — but the email **should be cleared immediately after use**, which you do on L63. ✅

**One remaining risk:** If the user clicks the magic link on a different device/browser, `emailForSignIn` won't be in `localStorage` and the app falls back to `window.prompt()` (L58). This is a terrible UX on a native Android app — `window.prompt()` may be blocked by the WebView or look completely alien.

**Fix:** Replace `window.prompt()` with your own in-app dialog that captures the email.

---

### 🟡 MEDIUM — `console.log` / `console.error` leaking in auth flows
**File:** [`auth.ts` L76–L86](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#L76-L86)
```ts
console.log("Linking password provider...");
console.log("Password provider linked successfully");
console.error("LINKING ERROR:", error);
```
**Issue:** These are raw `console.*` calls, bypassing your structured logger. In a production Android app, logs are visible to anyone with `adb logcat`. These expose internal auth flow state.

**Fix:** Replace all `console.*` in `auth.ts` with the structured `log.*` logger, and ensure the logger is set to `'warn'` or `'error'` level in production builds. Add a Vite build-time variable: `VITE_LOG_LEVEL=warn` for production.

---

## Layer 3 — Firebase Config (`firebase.ts`)

### 🟠 HIGH — Firebase config values hardcoded as fallbacks
**File:** [`firebase.ts` L70–L76](file:///d:/PYTHON/Password%20Manager/src/app/firebase.ts#L69-L76)
```ts
apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDsAH9m...',
appId:  import.meta.env.VITE_FIREBASE_APP_ID  || '1:10873...',
```
**Issue:** The hardcoded fallback values mean these **will appear in your production JS bundle** even if `.env` is set. Anyone who decompiles your APK or views `dist/assets/index-*.js` can extract them.

**Context:** Firebase web API keys are technically meant to be public (they identify your project, not authenticate you). Security is enforced by Firestore Rules and Auth. BUT:
- Your `messagingSenderId` and `appId` can be used to send FCM spam to your users.
- The API key can be used to call any Firebase REST API not protected by rules (e.g., Storage, ML Kit, etc.).

**Fix:** 
1. Remove the hardcoded fallbacks entirely — let the build fail loudly if `.env` is missing.
2. Restrict your Firebase API key in Google Cloud Console to **only allow requests from your app's SHA-256 certificate** (for Android) and your domain (for web). This is done in **APIs & Services → Credentials** in GCP.

---

### 🔴 CRITICAL — `firebase-admin` in client `dependencies`
**File:** [`package.json` L61](file:///d:/PYTHON/Password%20Manager/package.json#L61)
```json
"firebase-admin": "^13.7.0"
```
**Issue:** `firebase-admin` is a **server-side SDK** that uses privileged service account credentials to bypass ALL Firestore security rules. It should **never be in a browser bundle**.

**Risk:** If Vite accidentally tree-shakes it incorrectly (or if any import path leads to it), it could expose admin capabilities in the client. More immediately: the Admin SDK is 2MB+ and bloats your bundle.

**Fix:** Move it to `functions/package.json` only (where it already belongs). Remove from root `package.json`. Run `npm audit` to check if any client code actually imports it.

---

## Layer 4 — App State / Store (`store.ts`)

### ✅ PASS — Master password held in memory only, never written to disk
`_sessionPassword` is a module-level variable, never passed to `idbSet` or `localStorage`. ✅

### ✅ PASS — `clearSession()` zeros all sensitive state on lock/logout
Password, crypto key, TOTP key, cache, listeners — all cleared. ✅

### ✅ PASS — `saveVaultEverywhere` refuses to save if no encryption context
```ts
throw new Error('SECURITY: No encryption context. Vault save aborted.');
```
Good safety net — prevents accidental plaintext save. ✅

### 🟠 HIGH — `_sessionPassword` persists in memory after biometric unlock
**File:** [`store.ts` L1294–1296](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#L1289-L1330)
```ts
const { dekBase64 } = await BiometricBridge.unlockWithBiometric();
const key = await importDEK(dekBase64);
_sessionCryptoKey = key;
// _sessionPassword is NOT set here
```
**Issue:** When unlocking with biometrics, `_sessionPassword` remains `null`. Later, when `saveVaultEverywhere` is called and `_sessionCryptoKey` exists, it encrypts correctly using `_sessionCryptoKey`. BUT:

On L1329: `startRealtimeSync(uid, '')` — an **empty string password** is passed to the real-time sync listener. Inside `startRealtimeSync`, if `_sessionCryptoKey` is null (after an unexpected eviction), it falls back to `deriveEncryptionKey('', email)` — generating a **wrong key silently**, causing decryption failures that swallow errors silently.

**Fix:** For biometric unlocks, either:
1. Store `''` as `_sessionPassword` AND ensure `saveVaultEverywhere` always prefers `_sessionCryptoKey` (it does, via `let key = _sessionCryptoKey`), OR
2. After biometric unlock, load the vault from cloud (not just local) to get the latest data with the proper key.

Also consider: if the user changes their password on another device, their local encrypted data won't be re-decryptable with the biometric-stored old key. Add a "biometric stale" detection.

---

### 🟡 MEDIUM — `generateId()` falls back to `Math.random()` 
**File:** [`store.ts` L282–286](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#L282-L286)
```ts
function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}
```
**Issue:** `Math.random()` is **not cryptographically secure**. On a modern browser/WebView, `crypto.randomUUID()` will always be available. But the fallback is still dangerous — if somehow triggered, IDs could be predictable.

**Fix:** Remove the fallback. If `crypto.randomUUID` is missing, throw explicitly. Or use `crypto.getRandomValues(new Uint8Array(16))` and format as UUID manually.

---

### 🟡 MEDIUM — CSV export includes **plaintext passwords**
**File:** [`store.ts` L948–965](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#L948-L965)
```ts
const rows = items.map((i) =>
  [i.title, i.username, i.password, i.url, i.type, i.note].map(escape).join(','),
);
```
**Issue:** This is expected behavior for a password manager export, but there are two concerns:
1. **No confirmation dialog** (at least not here in the store — hopefully in the UI).
2. **No file encryption** — the exported CSV is raw plaintext. If saved to Downloads, it persists forever.
3. TOTP secrets, SSN (`identityData.ssn`), card CVV (`cardData.cvv`) are **not included** in the CSV export — verify this is intentional and document it.

**Fix:** 
- Ensure the UI has a prominent warning before export.
- Consider encrypting exports with a user-chosen password (like Bitwarden's encrypted JSON export).
- Explicitly document which fields are excluded from export.

---

### 🔵 LOW — `allowScreenshots: true` is the default
**File:** [`store.ts` L973](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#L970-L976)
```ts
const defaultSettings: AppSettings = {
  allowScreenshots: true,  // ← default is screenshots ALLOWED
```
**Issue:** For a password manager, the default should be **screenshots disabled**. A user who never visits settings will have their vault screenshotted by the OS during app switching.

**Fix:** Change default to `allowScreenshots: false`. Ensure the native Android `FLAG_SECURE` is applied on app launch, not just after the setting loads.

---

### 🔵 LOW — `checkAndMergeAutofillItems` trusts native data without validation
**File:** [`store.ts` L1203–1237](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#L1203-L1237)
```ts
const formattedItems = newItems.map((nItem: any) => ({
  id: nItem.id,
  title: nItem.title || 'Unknown',
  ...
}));
```
**Issue:** Data from the native side is cast with `any` and directly merged into the vault without type validation. A bug in the native code or a crafted native response could inject malformed items.

**Fix:** Add a Zod (or simple manual) validation schema for `nItem` before merging.

---

## Layer 5 — Firestore Rules (`firestore.rules`)

### ✅ PASS — Core user data: properly owner-only
```
match /users/{userId}/{document=**} {
  allow read, write: if isSignedIn() && isOwner(userId);
}
```
Correct — recursive wildcard, owner-only. ✅

### 🟡 MEDIUM — `registered_emails/{hash}` is publicly readable (unauthenticated)
**File:** [`firestore.rules` L53–56](file:///d:/PYTHON/Password%20Manager/firestore.rules#L53-L56)
```
match /registered_emails/{hash} {
  allow get: if true;  // No auth required
```
**Issue:** If the hash is weak (MD5, SHA-1), an attacker can brute-force known email addresses and confirm existence. This is an email enumeration vector.

**Fix:** 
1. Require `isSignedIn()` for reads (limit to authenticated users).
2. Use a **strong hash** (Argon2id/HMAC-SHA256 with a server-side secret) rather than a simple hash of the email.

---

### 🟡 MEDIUM — `app_config` is publicly readable
**File:** [`firestore.rules` L60–62](file:///d:/PYTHON/Password%20Manager/firestore.rules#L60-L62)
```
match /app_config/{document=**} {
  allow read: if true;
```
**Issue:** Anyone unauthenticated can read your app config. If this contains feature flags, API endpoints, internal URLs, or pricing config — it's exposed.

**Fix:** Change to `allow read: if isSignedIn();`. If you need unauthenticated access for pre-login UI (e.g., maintenance mode banner), keep only the specific document public, not the entire collection.

---

### 🟡 MEDIUM — Collection members: any signed-in user can write their own member document
**File:** [`firestore.rules` L77](file:///d:/PYTHON/Password%20Manager/firestore.rules#L74-L78)
```
allow write: if isSignedIn() && (isActiveMember(collectionId) || request.auth.uid == userId);
```
**Issue:** The second condition `request.auth.uid == userId` allows ANY signed-in user to **create or update their own member document** in any collection, even ones they've not been invited to. They could potentially set their own `role: 'owner'`.

**Fix:** Split `write` into `create` and `update`:
```
// Only invited users can create their own member doc (accepting invite)
allow create: if isSignedIn() && request.auth.uid == userId
  && request.resource.data.status == 'pending'
  && request.resource.data.role == 'viewer';  // Force minimum role
// Only active members can update
allow update: if isSignedIn() && isActiveMember(collectionId)
  && hasRole(collectionId, 'manager');
allow delete: if isSignedIn() && isActiveMember(collectionId)
  && (isOwner(userId) || hasRole(collectionId, 'manager'));
```

---

### 🔵 LOW — `folder_shares` write rule allows active members to write any share
**File:** [`firestore.rules` L119–122](file:///d:/PYTHON/Password%20Manager/firestore.rules#L110-L123)
```
(request.resource != null && isActiveMember(request.resource.data.folder_id))
```
**Issue:** An active member of folder A can write a `folder_share` document claiming folder A — even if that share belongs to another user. The condition `resource.data.user_id == request.auth.uid` on the first condition handles your own writes, but the member check on lines 119-122 is a looser catch-all.

**Fix:** Tighten to always require `request.resource.data.user_id == request.auth.uid` for creates.

---

## Layer 6 — Android (`AndroidManifest.xml`, `config.xml`)

### 🔴 CRITICAL — `android:allowBackup="true"`
**File:** [`AndroidManifest.xml` L5](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml#L4-L10)
```xml
android:allowBackup="true"
```
**Issue:** This allows Android Auto-Backup to copy your app's data (IndexedDB, localStorage, SQLCipher DB) to Google Drive backup. For a password manager, this means:
- User's **encrypted vault** gets backed up automatically.
- The backup is associated with the user's Google account but can be extracted with root or Android backup tools.
- Worse: it could restore an old vault onto a new device, potentially resurrecting deleted data.

**Fix:** Set `android:allowBackup="false"` immediately. This is **the most important Android security fix**.

If you want to allow backup of non-sensitive data (settings, theme), use `android:fullBackupContent` with an exclusion list.

---

### 🟡 MEDIUM — `config.xml` allows all origins: `<access origin="*" />`
**File:** [`config.xml` L3](file:///d:/PYTHON/Password%20Manager/android/app/src/main/res/xml/config.xml#L3)
```xml
<access origin="*" />
```
**Issue:** This is a Cordova-era config that Capacitor still respects in some contexts. It allows the WebView to make network requests to any origin, which is fine for a web app — but means there's no Content Security Policy enforcement at the WebView level for outbound requests.

**Fix:** Restrict to your Firebase domains only:
```xml
<access origin="https://*.firebaseapp.com" />
<access origin="https://*.googleapis.com" />
<access origin="https://fonts.gstatic.com" />
```

---

### 🔵 LOW — No `networkSecurityConfig` defined
**File:** [`AndroidManifest.xml`](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml)

**Issue:** No `android:networkSecurityConfig` attribute is set. Without it, Android uses default network security policy. For a password manager, you should explicitly:
1. Disable cleartext (HTTP) traffic.
2. Pin certificates to Firebase/Google domains (optional but strong).

**Fix:** Create `res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```
Add to manifest: `android:networkSecurityConfig="@xml/network_security_config"`

---

## Layer 7 — Logger (`logger.ts`)

### 🔴 CRITICAL — Logger is set to `'debug'` level with no production override
**File:** [`logger.ts` L33](file:///d:/PYTHON/Password%20Manager/src/app/utils/logger.ts#L32-L37)
```ts
let minLevel: LogLevel = 'debug';
```
**Issue:** Every single operation — every encrypt, every decrypt, every auth state change, every item count — is logged to the browser console (and via `adb logcat` on Android) **in production**. This includes:
- `log.info('Signing in with derived auth key', { email })` — user email in logs
- `log.info('Auth state changed', { uid, email })` — UID and email on every auth change
- `log.debug('Starting Argon2id derivation', { memory, iterations, saltLength })` — crypto internals
- `log.info('Saving vault payload everywhere', { uid, itemCount })` — vault size

**Risk:** An attacker with `adb logcat` access (rooted device, malicious MDM, debugging enabled) sees your users' emails, UIDs, and timing of every vault operation.

**Fix:** Add this to `vite.config.ts`:
```ts
define: {
  __PROD_LOG_LEVEL__: JSON.stringify(
    process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
  )
}
```
And in `logger.ts`:
```ts
declare const __PROD_LOG_LEVEL__: string;
let minLevel: LogLevel = __PROD_LOG_LEVEL__ as LogLevel;
```

---

## Layer 8 — Cloud Functions (`functions/src/`)

### ✅ PASS — All callable functions check `context.auth` before proceeding
Every exported function starts with an auth check — either `checkAuth(context)` helper or inline. ✅

### ✅ PASS — `searchUsers` has rate limiting (20/min per user, 60/min per IP)
Good protection against enumeration attacks. ✅

### ✅ PASS — `searchUsers` enforces minimum 100ms response time (timing attack protection)
```ts
if (elapsed < 100) await new Promise((r) => setTimeout(r, 100 - elapsed));
```
Prevents enumeration via timing side-channel. ✅

### 🟡 MEDIUM — Cloud Functions use `firebase-functions` v1 (Gen 1) API
**File:** [`functions/src/routes/users.ts` L13](file:///d:/PYTHON/Password%20Manager/functions/src/routes/users.ts#L13)
```ts
export const searchUsers = functions.https.onCall(async (data, context) => {
```
**Issue:** This is Firebase Functions Gen 1 API (`context.auth`, `context.rawRequest`). Gen 2 (`onCall` from `firebase-functions/v2`) has better cold start performance, more concurrency, and cleaner auth handling. Gen 1 will be deprecated.

**Fix:** Migrate to Gen 2:
```ts
import { onCall } from 'firebase-functions/v2/https';
export const searchUsers = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) { ... }
  const uid = request.auth.uid;
```

---

### 🟡 MEDIUM — `getConnections` has no rate limiting
**File:** [`functions/src/routes/users.ts` L113](file:///d:/PYTHON/Password%20Manager/functions/src/routes/users.ts#L113-L179)

**Issue:** `getConnections` has auth check but no rate limiting. An attacker with a valid auth token can call it in a tight loop, causing expensive collection-group queries to Firestore on every call.

**Fix:** Add rate limiting consistent with `searchUsers`: 10 calls per minute per user.

---

## Layer 9 — IndexedDB (`idb.ts`)

### ✅ PASS — Only encrypted payloads are stored
No plaintext vault data is stored in IndexedDB — only `{ ciphertext, iv }` objects. ✅

### 🔵 LOW — `idbGet`/`idbSet` open and close the DB on every operation
**File:** [`idb.ts` L46, L68](file:///d:/PYTHON/Password%20Manager/src/app/idb.ts)
```ts
const db = await openDB();  // Every call opens a new connection
tx.oncomplete = () => db.close();  // Closed after each tx
```
**Issue:** This is functionally correct but inefficient. For frequent operations (sync, settings loads), it creates unnecessary DB open/close cycles. Not a security issue, but a performance/reliability one.

**Fix:** Implement a singleton DB connection with lazy initialization.

---

## Layer 10 — Dependencies (`package.json`)

### 🔴 CRITICAL — `firebase-admin` in client dependencies (already flagged in Layer 3)

### 🟠 HIGH — `@xenova/transformers` (~100MB ML library) in a password manager
**File:** [`package.json` L54](file:///d:/PYTHON/Password%20Manager/package.json#L54)
```json
"@xenova/transformers": "^2.17.2"
```
**Issue:** This is a full ML inference library (BERT, GPT-2, etc.) that downloads WASM and model weights. In a password manager, this is an enormous attack surface — a supply chain compromise of `@xenova/transformers` could execute arbitrary code in your app with access to all vault data.

**Fix:** Remove if not actively used. If used (e.g., for password strength analysis or smart search), **lazy load** it only when needed and **sandbox it** in a Web Worker so it cannot access the main thread's state.

---

### 🟡 MEDIUM — No `npm audit` baseline on record
Run this now:
```bash
npm audit --audit-level=high
```
Fix any high/critical vulnerabilities. Add `npm audit` to your CI/CD pipeline to catch future issues automatically.

---

### 🔵 LOW — Using `^` ranges for all production dependencies
**File:** [`package.json`](file:///d:/PYTHON/Password%20Manager/package.json)
```json
"firebase": "^12.10.0"
```
**Issue:** Caret ranges allow minor and patch updates automatically. While npm-lock prevents this in practice, a `npm install` on a fresh machine after a lock file conflict or deletion could pull in a compromised minor version.

**Fix:** Pin production deps to exact versions in `package.json`: `"firebase": "12.10.0"`. Use `npm update` explicitly when you want to bump versions.

---

## Summary Table

| # | File | Severity | Finding |
|---|---|---|---|
| 1 | `package.json` | 🔴 Critical | `firebase-admin` in client deps |
| 2 | `logger.ts` | 🔴 Critical | `debug` log level in production leaks UIDs/emails |
| 3 | `AndroidManifest.xml` | 🔴 Critical | `allowBackup="true"` — vault data backed up to Google Drive |
| 4 | `firebase.ts` | 🟠 High | Firebase config hardcoded as fallback — in production bundle |
| 5 | `store.ts` | 🟠 High | Biometric unlock doesn't set `_sessionPassword`, passes `''` to realtime sync |
| 6 | `firestore.rules` | 🟡 Medium | `registered_emails` readable by anyone unauthenticated |
| 7 | `firestore.rules` | 🟡 Medium | `app_config` readable by anyone unauthenticated |
| 8 | `firestore.rules` | 🟡 Medium | Members collection: any user can write own member doc (role escalation) |
| 9 | `crypto.ts` | 🟡 Medium | Salt is email string, not random — document as architectural decision |
| 10 | `crypto.ts` | 🟡 Medium | `toBase64` spread can stack-overflow on large payloads |
| 11 | `auth.ts` | 🟡 Medium | `window.prompt()` fallback for passwordless email — broken on Android |
| 12 | `auth.ts` | 🟡 Medium | Raw `console.*` leaks auth flow in production logs |
| 13 | `store.ts` | 🟡 Medium | `allowScreenshots: true` is the default |
| 14 | `store.ts` | 🟡 Medium | CSV export plaintext — no warning/encryption |
| 15 | `store.ts` | 🟡 Medium | `generateId()` fallback uses `Math.random()` |
| 16 | `users.ts` (CF) | 🟡 Medium | `getConnections` has no rate limiting |
| 17 | `users.ts` (CF) | 🟡 Medium | Gen 1 Cloud Functions API (deprecation path) |
| 18 | `config.xml` | 🟡 Medium | `<access origin="*" />` — no origin restriction |
| 19 | `package.json` | 🟠 High | `@xenova/transformers` huge ML library — major supply chain risk |
| 20 | `firestore.rules` | 🔵 Low | `folder_shares` write rule too broad |
| 21 | `AndroidManifest.xml` | 🔵 Low | No `networkSecurityConfig` — cleartext not explicitly blocked |
| 22 | `secureMemory.ts` | 🔵 Low | `scrub()` JS limitation — string password can't be zeroed |
| 23 | `idb.ts` | 🔵 Low | New DB connection per operation — performance |
| 24 | `package.json` | 🔵 Low | `^` version ranges — prefer exact pins for security deps |

---

## Priority Fix Order

### Do Today (🔴 Critical)
1. `AndroidManifest.xml` → `android:allowBackup="false"`
2. `logger.ts` → Add production log level via Vite env variable
3. `package.json` → Remove `firebase-admin` from client deps

### Do This Week (🟠 High)
4. `firebase.ts` → Remove hardcoded Firebase config fallbacks
5. `store.ts` biometric path → Fix empty-string password passed to realtime sync
6. `package.json` → Evaluate and remove/isolate `@xenova/transformers`

### Do This Sprint (🟡 Medium)
7. `firestore.rules` → Fix members write rule (role escalation)
8. `firestore.rules` → Add `isSignedIn()` to `registered_emails` and `app_config`
9. `crypto.ts` → Fix `toBase64` stack overflow
10. `auth.ts` → Replace `window.prompt()` with in-app dialog
11. `auth.ts` → Replace raw `console.*` with structured logger
12. `store.ts` → Change `allowScreenshots` default to `false`

---

## What I Didn't Audit (Next Steps)
- `src/app/pages/` — UI components for XSS, sensitive data in render
- `src/app/firestore.ts` — Firestore query patterns, data validation
- `functions/src/services/` — Rate limit, invite, member service internals  
- `extension/` — Browser extension attack surface
- `android/app/src/main/java/` — Native Android code (SQLCipher usage, biometric implementation)
- Actual APK analysis with MobSF (static analysis beyond source code)
- Network traffic capture (verify TLS, no unexpected outbound calls)

> [!TIP]
> The three most impactful fixes you can make in under 30 minutes: (1) `allowBackup=false`, (2) production log level, (3) remove `firebase-admin` from client deps.
