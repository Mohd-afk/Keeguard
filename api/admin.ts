// api/admin.ts
// All firebase-admin operations are dynamic-imported inside the handler.
// This ensures ANY module-load crash is caught by our try/catch and
// returns a readable JSON error instead of FUNCTION_INVOCATION_FAILED HTML.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');

  if (request.method === 'OPTIONS') return response.status(200).end();

  let step = 'start';
  try {
    // ── 1. Auth header
    step = 'auth_header';
    const authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
    }
    const idToken = authHeader.slice(7);

    // ── 2. Dynamic-import firebase-admin (catches any module load crash)
    step = 'import_firebase_admin_app';
    const { initializeApp, cert, getApps, getApp } = await import('firebase-admin/app');

    step = 'import_firebase_admin_auth';
    const { getAuth } = await import('firebase-admin/auth');

    // ── 3. Initialize admin app (singleton)
    step = 'init_admin_app';
    let adminApp: any;
    if (getApps().length > 0) {
      adminApp = getApp();
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';

      if (!projectId || !clientEmail || !privateKey) {
        return response.status(500).json({
          success: false, step,
          error: `Missing env vars: ${[!projectId && 'FIREBASE_PROJECT_ID', !clientEmail && 'FIREBASE_CLIENT_EMAIL', !privateKey && 'FIREBASE_PRIVATE_KEY'].filter(Boolean).join(', ')}`,
        });
      }

      privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
      adminApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }

    // ── 4. Get auth instance
    step = 'get_auth';
    const adminAuth = getAuth(adminApp);

    // ── 5. Verify token
    step = 'verify_token';
    let decoded: any;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (e: any) {
      return response.status(403).json({ error: `Invalid token: ${e.message}` });
    }

    // ── 6. Admin gate
    step = 'admin_gate';
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return response.status(403).json({ error: `Access denied (${decoded.email})` });
    }

    // ── 7. GET — list users
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

    // ── 8. POST — admin actions
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
    // Always return JSON — never let Vercel return raw HTML error page
    return response.status(500).json({
      success: false,
      step,
      error: err.message ?? 'Internal server error',
      errorCode: err.code ?? null,
      errorType: err.constructor?.name ?? null,
    });
  }
}
