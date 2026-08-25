// PURPOSE: Automated maintenance and release script for update-apk-firestore.mjs.
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;

const files = readdirSync(ROOT);
// Match any vault-app-ba6e2-*.json (covers both legacy firebase-adminsdk names and shorter hash names)
const serviceAccountFile = files.find(f => f.startsWith('vault-app-ba6e2-') && f.endsWith('.json'));

if (!serviceAccountFile) {
  console.error('Could not find Firebase Admin service account JSON file matching vault-app-ba6e2-firebase-adminsdk... in root!');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
await db.collection('app_config').doc('latest_version').set({
  min_apk_version: version,
  apk_download_url: `https://github.com/Mohd-afk/apk-releases/releases/download/v${version}/app-debug.apk`
}, { merge: true });

console.log(`Successfully updated Firestore min_apk_version to ${version}`);
process.exit(0);
