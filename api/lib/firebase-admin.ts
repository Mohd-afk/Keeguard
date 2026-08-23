import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Initializes the Firebase Admin SDK lazily using environment variables.
 * Handles escaped newlines and outer quotes gracefully.
 */
function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Missing Firebase Admin SDK environment variables on Vercel. ` +
      `Required: FIREBASE_PROJECT_ID (${projectId ? 'OK' : 'MISSING'}), ` +
      `FIREBASE_CLIENT_EMAIL (${clientEmail ? 'OK' : 'MISSING'}), ` +
      `FIREBASE_PRIVATE_KEY (${privateKey ? 'OK' : 'MISSING'})`
    );
  }

  // Strip wrapping quotes if user pasted them into Vercel dashboard, and replace escaped newlines
  privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
