import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // CORS
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (request.method === 'OPTIONS') return response.status(200).end();

  let step = 'init';
  try {
    // ── Step 1: Lazy-import firebase-admin to catch module resolution errors
    step = 'import_firebase_admin';
    const { getAdminAuth, getAdminDb } = require('./lib/firebase-admin');

    // ── Step 2: Verify auth header
    step = 'auth_header_check';
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized: No authorization token provided' });
    }

    // ── Step 3: Initialize admin instances
    step = 'get_admin_auth';
    const adminAuth = getAdminAuth();

    step = 'get_admin_db';
    const adminDb = getAdminDb();

    // ── Step 4: Verify ID token
    step = 'verify_id_token';
    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken: any;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (tokenErr: any) {
      return response.status(403).json({ error: `Invalid or expired token: ${tokenErr.message}` });
    }

    // ── Step 5: Admin email check
    step = 'admin_email_check';
    if (decodedToken.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return response.status(403).json({ error: `Access Denied. Admin only. (got: ${decodedToken.email})` });
    }

    // ── Step 6: GET — list all users + stats
    if (request.method === 'GET') {
      step = 'list_users';
      const listUsersResult = await adminAuth.listUsers(1000);

      const users = listUsersResult.users.map((user: any) => ({
        uid: user.uid,
        email: user.email || 'No email',
        displayName: user.displayName || 'No display name',
        photoURL: user.photoURL || null,
        disabled: user.disabled,
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
        providers: user.providerData.map((p: any) => p.providerId),
      }));

      step = 'count_profiles';
      let totalProfiles = users.length;
      try {
        const snap = await adminDb.collection('userProfiles').count().get();
        totalProfiles = snap.data().count;
      } catch {
        // Non-fatal: fall back to auth count
      }

      return response.status(200).json({
        success: true,
        adminEmail: decodedToken.email,
        stats: {
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => !u.disabled).length,
          disabledUsers: users.filter((u: any) => u.disabled).length,
          totalProfiles,
        },
        users,
      });
    }

    // ── Step 7: POST — admin actions
    if (request.method === 'POST') {
      step = 'post_action';
      const { action, targetUid, disabled } = request.body || {};

      if (!targetUid) return response.status(400).json({ error: 'Target user UID is required' });

      if (targetUid === decodedToken.uid && action === 'toggleDisable') {
        return response.status(400).json({ error: 'Cannot disable your own admin account.' });
      }

      if (action === 'toggleDisable') {
        step = 'toggle_disable';
        const updatedUser = await adminAuth.updateUser(targetUid, { disabled: Boolean(disabled) });
        return response.status(200).json({
          success: true,
          message: `User ${updatedUser.email || targetUid} is now ${updatedUser.disabled ? 'Disabled' : 'Enabled'}`,
          user: { uid: updatedUser.uid, disabled: updatedUser.disabled },
        });
      }

      if (action === 'deleteUser') {
        step = 'delete_user';
        await adminAuth.deleteUser(targetUid);
        return response.status(200).json({
          success: true,
          message: `User account ${targetUid} has been permanently deleted.`,
        });
      }

      return response.status(400).json({ error: 'Unknown action specified' });
    }

    return response.status(405).json({ error: 'Method Not Allowed' });

  } catch (err: any) {
    // Return detailed error with step to diagnose without Vercel log access
    console.error(`[Admin API CRASH at step="${step}"]`, err);
    return response.status(500).json({
      success: false,
      step,
      error: err.message || 'Internal server error',
      errorCode: err.code || null,
    });
  }
}
