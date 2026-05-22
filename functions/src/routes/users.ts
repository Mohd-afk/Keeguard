// ─── Users Route / Callable ──────────────────────────────────────────────────
// Handles privacy-preserving username prefix search with uniform response times.
// ─────────────────────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { checkRateLimit } from '../services/rateLimitService';

/**
 * Search users by username prefix.
 * Enforces rate limiting and uniform response time of >= 100ms.
 */
export const searchUsers = functions.https.onCall(async (data, context) => {
  const startTime = Date.now();

  // 1. Ensure authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const queryText = (data.query || '').trim().toLowerCase();
  if (queryText.length < 3) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Query string must be at least 3 characters long.'
    );
  }

  const uid = context.auth.uid;
  const ip = context.rawRequest.ip || 'unknown-ip';

  // 2. Enforce rate limiting: 20 per minute per user, 60 per minute per IP
  try {
    await checkRateLimit(`searchUsers_user_${uid}`, {
      limit: 20,
      windowMs: 60000,
      errorMessage: 'Too many search requests. Please wait a minute.',
    });
    await checkRateLimit(`searchUsers_ip_${ip}`, {
      limit: 60,
      windowMs: 60000,
      errorMessage: 'Too many search requests from this network. Please wait a minute.',
    });
  } catch (err: any) {
    throw new functions.https.HttpsError('resource-exhausted', err.message);
  }

  const db = admin.firestore();

  // 3. Query usernames starting with queryText
  const snap = await db
    .collection('usernames')
    .where(admin.firestore.FieldPath.documentId(), '>=', queryText)
    .where(admin.firestore.FieldPath.documentId(), '<=', queryText + '\uf8ff')
    .limit(10)
    .get();

  const results: Array<{ uid: string; username: string; displayName?: string }> = [];

  // Fetch profiles in parallel to enrich search results with display details
  const profilePromises = snap.docs.map(async (doc) => {
    const username = doc.id;
    const userUid = doc.data().uid;

    if (userUid === uid) return; // Don't return self

    const profileSnap = await db
      .collection('users')
      .doc(userUid)
      .collection('data')
      .doc('profile')
      .get();

    const profileData = profileSnap.exists ? profileSnap.data()! : {};
    
    results.push({
      uid: userUid,
      username,
      displayName: profileData.displayName || profileData.display_name || undefined,
    });
  });

  await Promise.all(profilePromises);

  // 4. Guarantee uniform response time (minimum 100ms) to prevent timing attacks/enumeration
  const elapsed = Date.now() - startTime;
  if (elapsed < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100 - elapsed));
  }

  return { results };
});
