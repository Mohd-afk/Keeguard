// api/lib/firebase-admin.ts
// CommonJS-compatible Firebase Admin SDK initializer for Vercel serverless functions.
// Uses lazy getters to avoid top-level crashes from missing env vars.

const admin = require('firebase-admin');

let _app: any = null;

function getAdminApp() {
  if (_app) return _app;

  // Check already-initialized apps (handles hot-reload / multiple invocations)
  if (admin.apps && admin.apps.length > 0) {
    _app = admin.apps[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ].filter(Boolean).join(', ');
    throw new Error(`Firebase Admin SDK: Missing environment variables: ${missing}`);
  }

  // Normalise key: strip outer quotes, convert \\n → real newlines
  privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  _app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  return _app;
}

export function getAdminAuth() {
  return admin.auth(getAdminApp());
}

export function getAdminDb() {
  return admin.firestore(getAdminApp());
}
