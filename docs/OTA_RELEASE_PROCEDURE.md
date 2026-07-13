# 🚀 Keeguard OTA Release Procedure — Definitive Guide

> **⚠️ GLOBAL AGENT RULE (READ FIRST):**  
> **NEVER perform an OTA update unless the user explicitly says "do an OTA update" or "release OTA".**  
> Bumping `package.json` version, changing code, pushing to git, or building does NOT automatically trigger an OTA release.  
> OTA release is a separate, explicit step that must be consciously requested.

---

## How OTA vs Web vs APK Work (Architecture)

| Platform | How It Gets New Code | When Version Updates |
|----------|---------------------|----------------------|
| **Web** (Vercel) | Vercel auto-deploys when `main` is pushed to GitHub | Immediately after push — no action needed |
| **Mobile** (Android) | OTA: downloads new JS bundle in background | After `npm run release` AND user restarts app |
| **Mobile** (Android) | APK: full reinstall from GitHub Releases | Only when native code (Kotlin/Java/manifest) changes |

**Important:** Web and Mobile OTA are NOT the same thing.
- **Web version** = compiled `package.json` version baked into `dist/assets/index.js` at Vercel build time.  
- **Mobile OTA version** = bundle downloaded from `https://vault-app-ba6e2.web.app/bundles/<version>.zip`.
- They both read version from `package.json` but are deployed separately.

---

## Root Causes of Every Known Bug

### Bug 1: "App says updated but no changes appear"
**Cause:** `OTA_JUST_UPDATED_KEY` is written into localStorage BEFORE the new bundle is actually active. The toast fires on the NEXT boot, but the user might not have truly restarted (just backgrounded the app). The new bundle only activates after a full process kill + reopen.  
**Fix:** The toast is correct. The user must **fully close** the app (swipe away from recents) and reopen — NOT just background it.

### Bug 2: "Says up to date but wrong version shown"  
**Cause:** The Settings screen shows `packageJson.version` which is baked at build time into the JS bundle. After an OTA update the new bundle contains the new version number. But if you're looking at the web view (Vercel), it shows whatever version Vercel last built — which may be behind if Vercel hasn't re-deployed yet.  
**Fix:** Always push to git first (this triggers Vercel), then run OTA release.

### Bug 3: "Stale bundle — old 4.0.10.zip reused, missing new code"  
**Cause:** `release-ota.mjs` has idempotency: if `ota-updates/bundles/<version>.zip` already exists, it **skips re-bundling**. This means if a version was bundled from an older codebase, re-running release won't pick up new changes.  
**Fix:** Always delete the old bundle before rebuilding for the same version number. Avoid reusing version numbers — bump the version for every release.

### Bug 4: "No toast appears after update"  
**Cause:** On web, `OTA_JUST_UPDATED_KEY` is never checked (guarded by `Capacitor.isNativePlatform()`). On mobile, if the app crashes during download, the cleanup path removes the key. Also, if the user uses the "Check for Updates" button, the `forceCheckForUpdate()` function fires a separate inline toast (`✨ v${version} downloaded! Restart...`) but does NOT reuse the `OTA_JUST_UPDATED_KEY` — the success toast only fires on the NEXT boot via `App.tsx`.  
**Fix:** Two distinct toasts exist by design: (a) "downloading" inline toast, (b) "updated to vX.X.X" boot toast on next launch. Both working correctly is the expected behavior.

### Bug 5: "Mobile says no updates available / up to date on old version"
**Cause:** `getActiveVersion()` reads `CapacitorUpdater.current().bundle.version`. If the device is on the **builtin** bundle (i.e. no OTA has ever been applied), this returns `0.0.0`. The updater then compares `remote.version > 0.0.0` and downloads — which is CORRECT. However if a failed download blacklisted a version, the next boot skips it silently.  
**Fix:** Clear the failed versions blacklist from localStorage key `sv_ota_failed_versions` (see Debug section below).

---

## ✅ The Correct OTA Release Procedure

Follow **every step in order**. Do not skip any.

### Step 1: Make all your code changes
Make all desired changes to `src/`, `functions/`, components, pages, etc.

### Step 2: Bump the version number
Edit `package.json` — increment the version:
```json
"version": "4.0.X"
```
> **Rule:** Never reuse a version number. Always increment. If `4.0.10` was already released (even broken), next version MUST be `4.0.11` or higher.

### Step 3: Delete the stale bundle (CRITICAL)
```powershell
# Check if the bundle already exists for this version
ls ota-updates/bundles/<version>.zip

# If it exists, DELETE IT — otherwise the builder will skip and package old code
rm ota-updates/bundles/<version>.zip
```
> **Why:** The release script skips re-bundling if the zip already exists. Any stale zip from a previous failed/incomplete release will be reused as-is, packaging old code.

### Step 4: Commit and push to git
```powershell
git add .
git commit -m "feat: <description of changes> — bump to v<version>"
git push
```
> **Why:** This triggers **Vercel to rebuild and deploy the web app**. Without this, the web view stays on the old version. Git push and OTA release are both required for full sync.

### Step 5: Wait for Vercel to deploy
After `git push`, Vercel will start building. Check: https://vercel.com/dashboard  
The web app (https://keeguard-app.vercel.app) will be on the new version once Vercel finishes.

### Step 6: Run the OTA release
```powershell
npm run release
```
This single command does all of:
1. Runs `vite build` to compile the latest code from `src/`
2. Zips `dist/` using Capgo CLI into `ota-updates/bundles/<version>.zip`
3. Deploys `ota-updates/` folder to Firebase Hosting
4. Updates Firestore `app_config/latest_version` with the new version, URL, and SHA-256 checksum

### Step 7: Verify the release
After `npm run release` succeeds, verify:
- ✅ Firestore `app_config/latest_version.version` equals the new version
- ✅ Firebase Hosting URL `https://vault-app-ba6e2.web.app/bundles/<version>.zip` is accessible
- ✅ The checksum in Firestore matches the zip file

### Step 8: Test on mobile
1. Open the app on your Android device
2. Wait ~5 seconds for the background OTA check to run
3. You should see a toast: `✨ vX.X.X downloaded! Restart to get the new features.`
4. **Fully close** the app (swipe it out of recents / force stop)
5. Reopen the app
6. You should see a toast: `✅ Updated to vX.X.X`
7. Go to Settings → About → Version should show the new version

---

## 🚫 Common Mistakes to Never Make

| ❌ Wrong | ✅ Correct |
|---------|----------|
| Run `npm run release` before `git push` | Always `git push` first, then `npm run release` |
| Reuse the same version number | Always increment the version for every release |
| Forget to delete stale zip | Always `rm ota-updates/bundles/<version>.zip` if it exists |
| Expect changes to appear without a full app restart | User must fully close (kill) and reopen the app |
| Expect "Check for Updates" to apply changes immediately | It downloads the bundle; restart is still required to apply |
| Build `release` when `package.json` version wasn't bumped | Version must be bumped — old bundles are idempotently skipped |

---

## 🔍 Debug: How to Reset OTA State on Device

If the mobile app is stuck on wrong version or "up to date" when it shouldn't be:

Open the app, open browser devtools or logcat, and run in the app's localStorage console:
```javascript
// Clear all OTA state
localStorage.removeItem('sv_ota_pending_version');
localStorage.removeItem('sv_ota_pending_bundle_id');
localStorage.removeItem('sv_ota_failed_versions');
localStorage.removeItem('sv_ota_just_updated');
localStorage.removeItem('sv_ota_native_version');
```
Then force-close and reopen the app. It will re-check Firestore and download the latest bundle.

---

## How Web Version Display Works

The **web app (Vercel)** shows `package.json version` which is baked at Vercel build time.  
It does NOT use OTA. Web always runs the latest Vercel deployment.  

The "Check for Updates" button on web returns `not_supported` — this is CORRECT behavior, not a bug. The web app never needs OTA because Vercel redeploys automatically on every `git push`.

The **Settings page version display** on web shows whatever version was compiled into the `dist/assets/index.js` at the time Vercel built the app. If Vercel is building, it may briefly show the old version. Wait for Vercel to finish.

---

## Quick Reference Checklist

```
Before every OTA release:
[ ] All code changes committed locally
[ ] package.json version bumped (never reuse a version)  
[ ] Stale bundle deleted: rm ota-updates/bundles/<version>.zip
[ ] git push done (Vercel will auto-deploy web)

During release:
[ ] npm run release (builds, zips, deploys to Firebase, updates Firestore)

After release:
[ ] Verify Firestore shows new version
[ ] Verify Firebase Hosting URL accessible
[ ] Test on mobile: background download toast appears
[ ] Full app kill + reopen: "Updated to vX.X.X" toast appears
[ ] Settings → About shows new version
```
