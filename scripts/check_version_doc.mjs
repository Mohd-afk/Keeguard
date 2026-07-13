import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const rootFiles = readdirSync(ROOT);
const serviceAccountFile = rootFiles.find(
  f => f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json')
);

if (!serviceAccountFile) {
  console.error('❌ Service account not found');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const doc = await db.collection('app_config').doc('latest_version').get();
console.log("Firestore app_config/latest_version content:", doc.data());
process.exit(0);
