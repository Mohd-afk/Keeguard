// api/admin.ts
// Admin API handler — uses Firebase Admin Auth only (no Firestore gRPC).
// Firestore user-profile counts are fetched via the Firebase REST API to avoid
// native gRPC binary issues in the Vercel Lambda sandbox.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth } from './lib/firebase-admin.js';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

// Fetch Firestore collection count via REST API (avoids gRPC native binaries)
async function getFirestoreCount(collection: string, projectId: string, accessToken: string): Promise<number> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        select: { fields: [{ fieldPath: '__name__' }] },
        limit: 1000,
      },
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) return 0;
    const docs: any[] = await res.json();
    // Filter out empty results (Firestore REST returns one empty object if no results)
    return docs.filter((d: any) => d.document).length;
  } catch {
    return 0;
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept'
  );

  if (request.method === 'OPTIONS') return response.status(200).end();

  let step = 'start';
  try {
    // ── 1. Auth header
    step = 'auth_header';
    const authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
    }

    // ── 2. Get admin auth instance
    step = 'init_admin_auth';
    const adminAuth = getAdminAuth();

    // ── 3. Verify token
    step = 'verify_token';
    const idToken = authHeader.slice(7);
    let decoded: any;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e: any) {
      return response.status(403).json({ error: `Invalid token: ${e.message}` });
    }

    // ── 4. Admin gate
    step = 'admin_gate';
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return response.status(403).json({ error: `Access denied (${decoded.email})` });
    }

    // ── 5. GET — list users
    if (request.method === 'GET') {
      step = 'list_users';
      const result = await adminAuth.listUsers(1000);

      const users = result.users.map((u) => ({
        uid: u.uid,
        email: u.email ?? 'No email',
        displayName: u.displayName ?? '',
        photoURL: u.photoURL ?? null,
        disabled: u.disabled,
        creationTime: u.metadata.creationTime,
        lastSignInTime: u.metadata.lastSignInTime,
        providers: u.providerData.map((p) => p.providerId),
      }));

      // Firestore profile count via REST (no gRPC)
      step = 'count_profiles';
      const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
      // Use the ID token to access Firestore REST (admin-level read)
      const totalProfiles = await getFirestoreCount('userProfiles', projectId, idToken);

      return response.status(200).json({
        success: true,
        adminEmail: decoded.email,
        stats: {
          totalUsers: users.length,
          activeUsers: users.filter((u) => !u.disabled).length,
          disabledUsers: users.filter((u) => u.disabled).length,
          totalProfiles: totalProfiles || users.length,
        },
        users,
      });
    }

    // ── 6. POST — admin actions
    if (request.method === 'POST') {
      step = 'post_action';
      const { action, targetUid, disabled } = (request.body as any) ?? {};

      if (!targetUid) return response.status(400).json({ error: 'targetUid required' });

      if (targetUid === decoded.uid && action === 'toggleDisable') {
        return response.status(400).json({ error: 'Cannot disable your own account.' });
      }

      if (action === 'toggleDisable') {
        step = 'toggle_disable';
        const updated = await adminAuth.updateUser(targetUid, { disabled: Boolean(disabled) });
        return response.status(200).json({
          success: true,
          message: `${updated.email ?? targetUid} is now ${updated.disabled ? 'Disabled' : 'Active'}`,
          user: { uid: updated.uid, disabled: updated.disabled },
        });
      }

      if (action === 'deleteUser') {
        step = 'delete_user';
        await adminAuth.deleteUser(targetUid);
        return response.status(200).json({ success: true, message: `User ${targetUid} deleted.` });
      }

      return response.status(400).json({ error: 'Unknown action' });
    }

    return response.status(405).json({ error: 'Method Not Allowed' });

  } catch (err: any) {
    console.error(`[Admin API] CRASH at step="${step}":`, err);
    return response.status(500).json({
      success: false,
      step,
      error: err.message ?? 'Internal server error',
      errorCode: err.code ?? null,
    });
  }
}
