import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const files = readdirSync(ROOT);
const serviceAccountFile = files.find(f => f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json'));

if (!serviceAccountFile) {
  console.error('Service account not found');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'vault-app-ba6e2.appspot.com'
});

const bucket = admin.storage().bucket();
const apkPath = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

console.log('Uploading APK to Firebase Storage...');
try {
  const [file] = await bucket.upload(apkPath, {
    destination: 'apks/app-debug.apk',
    metadata: {
      contentType: 'application/vnd.android.package-archive',
      cacheControl: 'public, max-age=3600'
    }
  });

  try {
    await file.makePublic();
  } catch(e) { /* ignore */ }

  const token = 'v501_' + Date.now();
  await file.setMetadata({
    metadata: { firebaseStorageDownloadTokens: token }
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent('apks/app-debug.apk')}?alt=media&token=${token}`;
  console.log('✅ Public APK Download URL:', downloadUrl);

  const db = admin.firestore();
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  await db.collection('app_config').doc('latest_version').set({
    min_apk_version: pkg.version,
    apk_download_url: downloadUrl
  }, { merge: true });

  console.log(`✅ Successfully updated Firestore min_apk_version to ${pkg.version} with direct Firebase Storage download link!`);
  process.exit(0);
} catch(err) {
  console.error('Failed to upload APK:', err);
  process.exit(1);
}
