// api/admin.ts
// Uses firebase-admin v11 (CJS-compatible) via dynamic default import.
// Dynamic import() keeps crash inside try/catch → returns JSON, never HTML.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

async function getAdminAuth() {
  const adminModule = await import('firebase-admin');
  const admin = (adminModule as any).default ?? adminModule;

  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
    privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }

  return admin.auth();
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');

  if (request.method === 'OPTIONS') return response.status(200).end();

  let step = 'start';
  try {
    step = 'auth_header';
    const authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
    }
    const idToken = authHeader.slice(7);

    step = 'init_admin';
    const adminAuth = await getAdminAuth();

    step = 'verify_token';
    let decoded: any;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e: any) {
      return response.status(403).json({ error: `Invalid token: ${e.message}` });
    }

    step = 'admin_gate';
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return response.status(403).json({ error: `Access denied (${decoded.email})` });
    }

    if (request.method === 'GET') {
      step = 'list_users';
      const result = await adminAuth.listUsers(1000);

      const users = result.users.map((u: any) => ({
        uid: u.uid,
        email: u.email ?? 'No email',
        displayName: u.displayName ?? '',
        photoURL: u.photoURL ?? null,
        disabled: u.disabled,
        creationTime: u.metadata.creationTime,
        lastSignInTime: u.metadata.lastSignInTime,
        providers: u.providerData.map((p: any) => p.providerId),
      }));

      return response.status(200).json({
        success: true,
        adminEmail: decoded.email,
        stats: {
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => !u.disabled).length,
          disabledUsers: users.filter((u: any) => u.disabled).length,
          totalProfiles: users.length,
        },
        users,
      });
    }

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
      success: false, step,
      error: err.message ?? 'Internal server error',
      errorCode: err.code ?? null,
      errorType: err.constructor?.name ?? null,
    });
  }
}
