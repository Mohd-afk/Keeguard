// api/lib/firebase-admin.ts
// Initializes Firebase Admin SDK using ESM subpath imports (firebase-admin v12+).
// Uses lazy singleton pattern safe for Vercel cold starts and warm re-use.
// NOTE: Does NOT use Firestore Admin (avoids native gRPC binary issues in Vercel Lambda).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function buildAdminApp() {
  if (getApps().length > 0) return getApp();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ].filter(Boolean).join(', ');
    throw new Error(`Firebase Admin: Missing env vars: ${missing}`);
  }

  // Normalise: strip outer quotes, convert escaped \n → real newlines
  privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function getAdminAuth() {
  return getAuth(buildAdminApp());
}
