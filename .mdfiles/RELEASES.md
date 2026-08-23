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
   - Packages `dist/` into a zip archive with deterministic folder structure (`archiver`).
   - Generates SHA-256 hash of the zip archive.
   - Deploys static zip to Firebase Hosting (`/ota-updates/bundles/<bundle_id>.zip`).
   - Updates Firestore document `app_config/latest_version` with bundle metadata (`version`, `url`, `checksum`).
3. Safety Check: 3-state tracking (`sv_ota_pending_version`, `sv_ota_pending_bundle_id`, `sv_ota_active_version`) guarantees that cold-boot checks run `notifyAppReady()` before promoting the new bundle to active status.

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
