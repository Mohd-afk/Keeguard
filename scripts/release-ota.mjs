#!/usr/bin/env node
/**
 * Automated OTA Release Script (`npm run release`)
 * Packages `dist/` using @capgo/cli, deploys bundle zip to Firebase Hosting, calculates SHA-256 checksum, and updates Firestore `app_config/latest_version`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT    = resolve(import.meta.dirname, '..');
const DIST    = join(ROOT, 'dist');
const OTA_DIR = join(ROOT, 'ota-updates', 'bundles');

// ─── 1. Read version from package.json ──────────────────────────────
const pkg     = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;

if (!version) {
  console.error('❌ No "version" field found in package.json');
  process.exit(1);
}

console.log(`\n🚀 Starting OTA release for version: ${version}\n`);

if (!existsSync(DIST)) {
  console.error('❌ dist/ folder not found. Run "npm run build" first.');
  process.exit(1);
}

// ─── 2. Create output directory ──────────────────────────────────────
mkdirSync(OTA_DIR, { recursive: true });

const zipPath     = join(OTA_DIR, `${version}.zip`);
const appId       = 'com.mohdj.securevault';
const tempZipName = `${appId}_${version}.zip`;
const tempZipPath = join(ROOT, tempZipName);

// ─── 3. Bundle using Capgo CLI ───────────────────────────────────────
// Hard error if the bundle already exists — NEVER silently reuse a stale zip.
// If you need to rebuild, delete the zip first: rm ota-updates/bundles/<version>.zip
if (existsSync(zipPath)) {
  console.error(
    `\n❌ ERROR: Bundle ota-updates/bundles/${version}.zip ALREADY EXISTS!\n` +
    `\n   This guard exists to prevent accidentally repackaging stale code.` +
    `\n   If you intentionally want to rebuild this version, run:\n` +
    `\n     rm ota-updates/bundles/${version}.zip\n` +
    `\n   Then re-run: npm run release\n` +
    `\n   OR bump the version in package.json to a new number.\n`
  );
  process.exit(1);
} else {
  console.log(`📦 Zipping dist/ using @capgo/cli...`);

  // Clean up any stale temp files from a previous failed run
  if (existsSync(tempZipPath)) {
    unlinkSync(tempZipPath);
    console.log(`   🧹 Cleaned up stale temp file: ${tempZipName}`);
  }

  try {
    execSync(
      `npx @capgo/cli bundle zip ${appId} -p ./dist -b ${version} --no-code-check`,
      { stdio: 'inherit', cwd: ROOT }
    );

    if (!existsSync(tempZipPath)) {
      throw new Error(
        `Capgo CLI succeeded but expected output file not found at: ${tempZipPath}\n` +
        `Check that @capgo/cli version outputs the file as "<appId>_<version>.zip" in the project root.`
      );
    }

    // Move to the canonical OTA location
    renameSync(tempZipPath, zipPath);
    console.log(`✅ Bundle created: ota-updates/bundles/${version}.zip\n`);
  } catch (err) {
    console.error('❌ Failed to create bundle zip with Capgo CLI:', err);
    process.exit(1);
  }
}

// ─── 4. Calculate checksum of the final zip ──────────────────────────
// IMPORTANT: calculate BEFORE deploying so Firestore and the file are always
// in sync. If a previous run put a different file at this path, we recalculate.
const crypto    = await import('crypto');
const fileBuffer = readFileSync(zipPath);
const hashSum    = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const checksum = hashSum.digest('hex');
console.log(`🔒 SHA-256 Checksum: ${checksum}`);

// ─── 5. Verify the URL we will write to Firestore actually works ──────
// The firebase.json sets "public": "ota-updates", so the hosted root IS
// the ota-updates/ directory. Bundles at ota-updates/bundles/{v}.zip are
// served at https://<project>.web.app/bundles/{v}.zip
const hostedUrl = `https://vault-app-ba6e2.web.app/bundles/${version}.zip`;
console.log(`🔗 OTA bundle URL will be: ${hostedUrl}\n`);

// ─── 6. Deploy to Firebase Hosting ──────────────────────────────────
console.log(`🚀 Deploying ota-updates/ to Firebase Hosting...`);
try {
  execSync('npx firebase-tools deploy --only hosting', { stdio: 'inherit', cwd: ROOT });
} catch (err) {
  console.error('❌ Firebase Hosting deploy failed. Aborting Firestore update.');
  console.error('   The app_config/latest_version Firestore document has NOT been updated.');
  console.error('   Your users are still on the previous version. Fix the deploy error and re-run.');
  process.exit(1); // Release gate: never update Firestore if hosting fails
}
console.log(`✅ Hosting deployment successful.\n`);

// ─── 7. Update Firestore Metadata ───────────────────────────────────
console.log(`📝 Updating Firestore app_config/latest_version...`);

// Find the service account file
const rootFiles         = readdirSync(ROOT);
// Match any vault-app-ba6e2-*.json (covers both legacy firebase-adminsdk names and shorter hash names)
const serviceAccountFile = rootFiles.find(
  f => f.startsWith('vault-app-ba6e2-') && f.endsWith('.json')
);

if (!serviceAccountFile) {
  console.error(
    '❌ Could not find Firebase Admin service account JSON file matching ' +
    'vault-app-ba6e2-*.json in the project root!\n' +
    '   Make sure the service account JSON is in the project root directory.'
  );
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  // Use merge: true so we never overwrite min_apk_version or apk_download_url
  // (those fields are only set when publishing a new native APK release).
  const firestorePayload = {
    version:      version,
    url:          hostedUrl,
    checksum:     checksum,
    critical:     false,
    releaseNotes: `Automated OTA release ${version}`,
    releasedAt:   new Date().toISOString()
  };

  console.log(`\n   Writing to Firestore app_config/latest_version:`);
  console.log(`     version:  ${firestorePayload.version}`);
  console.log(`     url:      ${firestorePayload.url}`);
  console.log(`     checksum: ${firestorePayload.checksum}`);
  console.log(`     critical: ${firestorePayload.critical}\n`);

  await db.collection('app_config').doc('latest_version').set(firestorePayload, { merge: true });

  console.log(`✅ Firestore successfully updated to version ${version}`);
} catch (err) {
  console.error('❌ Failed to update Firestore:', err);
  console.error(
    '⚠️  WARNING: Firebase Hosting is already deployed but Firestore was NOT updated!\n' +
    `   Manually update app_config/latest_version in Firebase Console:\n` +
    `     version:  ${version}\n` +
    `     url:      ${hostedUrl}\n` +
    `     checksum: ${checksum}\n`
  );
  process.exit(1);
}

console.log('\n🎉 OTA Release completely finished successfully!');
console.log(`   Version ${version} is now live and will be delivered to all devices on next app open.\n`);
process.exit(0);
