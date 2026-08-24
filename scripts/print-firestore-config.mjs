import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const rootFiles = readdirSync(ROOT);
const serviceAccountFile = rootFiles.find(
  f => f.startsWith('vault-app-ba6e2-') && f.endsWith('.json')
);

if (!serviceAccountFile) {
  console.error('❌ Could not find Firebase Admin service account JSON file!');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const docRef = db.collection('app_config').doc('latest_version');
const docSnap = await docRef.get();

if (!docSnap.exists) {
  console.log('❌ No such document!');
} else {
  console.log('🔥 Current Firestore app_config/latest_version:');
  console.log(JSON.stringify(docSnap.data(), null, 2));
}
process.exit(0);
