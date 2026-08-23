import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, getAdminDb } from './lib/firebase-admin';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    // 1. Authorization Layer
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized: No authorization token provided' });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (tokenErr: any) {
      return response.status(403).json({ error: `Unauthorized: Invalid or expired token (${tokenErr.message})` });
    }

    // 2. Strict Admin Role Check
    if (decodedToken.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return response.status(403).json({ error: 'Access Denied: Admin privileges required for email: ' + decodedToken.email });
    }

    // 3. GET: List All Registered Users & System Metadata
    if (request.method === 'GET') {
      const maxResults = 1000;
      const listUsersResult = await adminAuth.listUsers(maxResults);

      const users = listUsersResult.users.map((user) => ({
        uid: user.uid,
        email: user.email || 'No email',
        displayName: user.displayName || 'No display name',
        photoURL: user.photoURL || null,
        disabled: user.disabled,
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
        providers: user.providerData.map((p) => p.providerId),
      }));

      // Count Firestore user profiles & active metrics
      let totalProfiles = 0;
      try {
        const snap = await adminDb.collection('userProfiles').count().get();
        totalProfiles = snap.data().count;
      } catch {
        totalProfiles = users.length;
      }

      return response.status(200).json({
        success: true,
        adminEmail: decodedToken.email,
        stats: {
          totalUsers: users.length,
          activeUsers: users.filter((u) => !u.disabled).length,
          disabledUsers: users.filter((u) => u.disabled).length,
          totalProfiles,
        },
        users,
      });
    }

    // 4. POST: Admin Actions (Toggle Disable / Reset / Delete)
    if (request.method === 'POST') {
      const { action, targetUid, disabled } = request.body || {};

      if (!targetUid) {
        return response.status(400).json({ error: 'Target user UID is required' });
      }

      // Prevent admin self-disabling
      if (targetUid === decodedToken.uid && action === 'toggleDisable') {
        return response.status(400).json({ error: 'Cannot disable your own admin account.' });
      }

      if (action === 'toggleDisable') {
        const updatedUser = await adminAuth.updateUser(targetUid, {
          disabled: Boolean(disabled),
        });

        return response.status(200).json({
          success: true,
          message: `User ${updatedUser.email || targetUid} is now ${updatedUser.disabled ? 'Disabled' : 'Enabled'}`,
          user: {
            uid: updatedUser.uid,
            disabled: updatedUser.disabled,
          },
        });
      }

      if (action === 'deleteUser') {
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
    console.error('[Admin API Error]:', err);
    return response.status(500).json({
      success: false,
      error: err.message || 'Internal server error in Admin API',
    });
  }
}
