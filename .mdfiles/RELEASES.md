# 🚀 Keeguard — Release & Deployment Guide

> **Deployment Guide for Self-Hosted OTA Updates and Native Android APK Releases**

---

## ⚡ 1. Self-Hosted OTA Updates (Silent Web Updates)

### Overview
OTA updates deliver instant web bundle updates to Android devices via `@capgo/capacitor-updater` without requiring APK reinstalls. Update bundles are hosted on **Firebase Hosting** under `ota-updates/bundles/`.

### Automated OTA Command
```bash
npm run release
```

### What `npm run release` Does Automatically:
1. Executes `vite build` to produce optimized `/dist` production output.
2. Runs `scripts/release-ota.mjs`:
   - Packages `dist/` into a zip archive (`@capgo/cli`).
   - Generates SHA-256 hash of the zip archive.
   - Deploys static zip to Firebase Hosting (`/ota-updates/bundles/<version>.zip`).
   - Updates Firestore document `app_config/latest_version` with bundle metadata (`version`, `url`, `checksum`).
3. Safety Check: 3-state tracking (`sv_ota_pending_version`, `sv_ota_pending_bundle_id`, `sv_ota_active_version`) guarantees that cold-boot checks run `notifyAppReady()` before promoting the new bundle to active status.

### OTA Update Behavior on Device:
- On **app open**: `initUpdater()` runs in the background, silently downloads the new bundle, and shows a toast: `"✨ v5.1.0 downloaded! Restart the app to apply."`.
- On **next app restart**: the new bundle is applied.
- On **"Check for Updates" tap**: `forceCheckForUpdate()` runs the same download+toast flow.

### ⚠️ Mandatory Post-OTA Rule
**IMMEDIATELY AFTER EVERY OTA RELEASE, YOU MUST PUSH CODE TO GITHUB**:
```bash
git add .
git commit -m "release: ota update vX.X.X"
git push origin main
```

---

## 📱 2. Native Android APK Releases

### When is an APK Build Required?
An APK release (re-install) is strictly required when:
- Adding/updating Capacitor native plugins (e.g. `@capacitor-firebase/authentication`, `@capacitor/share`).
- Modifying Android native Java/Kotlin code (`android/app/src/main/java/...`).
- Updating Android manifest or Gradle configurations (`build.gradle`, `variables.gradle`).

### ⚠️ Mandatory Pre-APK Release Rule
**BEFORE BUILDING AND PUBLISHING AN APK, YOU MUST INCREMENT THE RELEASE VERSION NUMBER**:
1. `package.json` → increment `version` (e.g. `4.0.0` → `4.0.1` or `5.0.0`).
2. `android/app/build.gradle` → increment `versionCode` (+1) and `versionName`.
3. Firestore `app_config/latest_version` → set `min_apk_version` to match the new version code.

### APK Build Steps:
```bash
npx cap sync android
cd android
./gradlew assembleRelease
```
The compiled APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.

---

## 🐛 3. Known Root Cause Bug — Firestore Never Updated After OTA Release

> **CRITICAL INCIDENT — Documented 2026-08-24**

### Problem Description
After every `npm run release`, the Firestore document `app_config/latest_version` was **NEVER updated** because all release and admin scripts used the wrong service account filename pattern:

```
WRONG (what scripts searched for): vault-app-ba6e2-firebase-adminsdk*.json
ACTUAL file in repo root:          vault-app-ba6e2-68637e3993d6.json
```

The scripts exited with `❌ Could not find Firebase Admin service account JSON file` — but because the Firebase Hosting deploy already succeeded before that step, the error was silent from the user's perspective. The end result was:

- **Firebase Hosting** always had the latest zip bundle ✅
- **Firestore `app_config/latest_version`** was stuck on an old version number ❌
- **Mobile app** queried Firestore, saw `remote.version <= nativeVersion`, and skipped the OTA download ❌
- Users saw a stale "v5.0.2 downloaded" notification while running native APK v5.0.3 ❌

### Fix Applied (2026-08-24)
All scripts were updated to use the broader pattern:

```js
// BEFORE (broken):
f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json')

// AFTER (fixed):
f.startsWith('vault-app-ba6e2-') && f.endsWith('.json')
```

**Files fixed**:
- `scripts/release-ota.mjs`
- `scripts/update-apk-firestore.mjs`
- `scripts/upload-apk-storage.mjs`
- `scripts/send-in-app-broadcast.mjs`
- `scripts/print-firestore-config.mjs`
- `scripts/find-buckets.mjs`
- `scripts/export-user-emails.mjs`
- `scripts/check_version_doc.mjs`

---

## ✅ 4. Release Verification Checklist

**After EVERY `npm run release`, verify these BEFORE pushing to git:**

```
[ ] 1. Build succeeded with exit code 0 ("✓ built in XX.XXs")
[ ] 2. "✅ Bundle created: ota-updates/bundles/X.X.X.zip" appears in output
[ ] 3. "✅ Hosting deployment successful." appears in output
[ ] 4. "✅ Firestore successfully updated to version X.X.X" appears in output
[ ] 5. git add . && git commit -m "release: ota update vX.X.X" && git push origin main
```

> [!CAUTION]
> If step 4 is missing — the Firestore update FAILED. **Do not push to GitHub** yet.
> Manually run the Firestore updater:
> ```bash
> node -e "import('firebase-admin/app').then(async ({initializeApp, cert}) => { const {getFirestore} = await import('firebase-admin/firestore'); const sa = JSON.parse(require('fs').readFileSync('vault-app-ba6e2-68637e3993d6.json')); initializeApp({credential:cert(sa)}); await getFirestore().collection('app_config').doc('latest_version').set({version:'X.X.X', url:'https://vault-app-ba6e2.web.app/bundles/X.X.X.zip'},{merge:true}); console.log('done'); process.exit(0); });"
> ```

---

## 🔄 5. OTA Update Version Logic (How the Updater Decides)

The updater in `src/app/services/updater.ts` follows this decision tree on every app open:

```
App opens → initUpdater()
  │
  ├── [Guard] Is native platform? → No → Exit (web doesn't OTA-update)
  │
  ├── [Step 1] Migration Guard
  │     Was APK re-installed? Clear stale OTA state if native version changed.
  │
  ├── [Step 2] Post-boot verification
  │     Did last OTA bundle boot successfully? → Confirm or rollback + blacklist.
  │
  └── [Step 3] checkForUpdate()
        │
        ├── Fetch Firestore app_config/latest_version
        ├── Get nativeVersion from App.getInfo()
        ├── [CRITICAL GUARD] if remote.version <= nativeVersion → SKIP (APK-only release)
        ├── Get activeOtaVersion from CapacitorUpdater.current()
        ├── if remote.version <= activeOtaVersion → SKIP (already up to date)
        ├── if remote.url is empty → SKIP (APK-only release, no OTA bundle)
        └── if all guards pass → downloadAndApply(remote)
              → CapacitorUpdater.download()
              → CapacitorUpdater.next() (stage for next restart)
              → Show toast: "✨ vX.X.X downloaded! Restart to apply"
```

### Why "Check for Updates" showed v5.0.2 while running v5.0.3
The Firestore document was stuck at `5.0.2` (the Firestore update step crashed silently due to the bad service account filename). The app read `5.0.2` from Firestore, saw `5.0.2 <= 5.0.3 (native)`, hit the critical guard and skipped the download. The "v5.0.2 downloaded" toast was a leftover pending notification from a previous boot cycle.

---

## 🔧 6. Troubleshooting OTA Updates

| Symptom | Likely Cause | Fix |
|---|---|---|
| App shows old version after OTA | Firestore wasn't updated | Check `npm run release` output for step 4 confirmation; manually update Firestore |
| "Already on latest" but version is wrong | Firestore doc version is wrong | Check Firebase Console → Firestore → `app_config/latest_version` |
| Toast says "v5.0.2 downloaded" but APK is 5.0.3 | Stale localStorage pending state | Clear app data or wait for next migration guard to clear it on APK version change |
| OTA download never triggers | `remote.version <= nativeVersion` guard | OTA version must be strictly higher than installed APK version |
| OTA rolled back on boot | Bundle failed to load → blacklisted | Check logs; delete app data to clear blacklist |
