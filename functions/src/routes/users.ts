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

  let queryText = (data.query || '').trim().toLowerCase();
  if (queryText.startsWith('@')) {
    queryText = queryText.substring(1);
  }
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
  // Exact match preference to prevent enumeration, otherwise fuzzy prefix query limited to 5
  const exactSnap = await db.collection('usernames').doc(queryText).get();
  let usernamesDocs: Array<admin.firestore.DocumentSnapshot> = [];
  if (exactSnap.exists) {
    usernamesDocs = [exactSnap];
  } else {
    const snap = await db
      .collection('usernames')
      .where(admin.firestore.FieldPath.documentId(), '>=', queryText)
      .where(admin.firestore.FieldPath.documentId(), '<=', queryText + '\uf8ff')
      .limit(5)
      .get();
    usernamesDocs = snap.docs;
  }

  const results: Array<{ uid: string; username: string; displayName?: string }> = [];

  // Fetch profiles in parallel to enrich search results with display details
  const profilePromises = usernamesDocs.map(async (doc) => {
    const username = doc.id;
    const uData = doc.data();
    if (!uData) return;
    const userUid = uData.uid;

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

/**
 * Fetch the recent users list based on active memberships in the current user's shared collections.
 */
export const getConnections = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const uid = context.auth.uid;
  const db = admin.firestore();

  try {
    // 1. Find collections where this user is an active member
    const memberSnap = await db
      .collectionGroup('members')
      .where('user_id', '==', uid)
      .where('status', '==', 'active')
      .get();

    const collectionIds = memberSnap.docs.map((doc) => doc.ref.parent.parent!.id);

    if (collectionIds.length === 0) {
      return { connections: [] };
    }

    const connectionsMap = new Map<string, { uid: string; username: string; displayName?: string }>();

    // 2. Fetch active members of these collections in parallel
    const fetchPromises = collectionIds.map(async (cid) => {
      const memsSnap = await db
        .collection('collections')
        .doc(cid)
        .collection('members')
        .where('status', '==', 'active')
        .get();

      for (const mDoc of memsSnap.docs) {
        const mData = mDoc.data();
        const memberUid = mData.user_id;
        if (memberUid === uid) continue; // Skip self

        if (!connectionsMap.has(memberUid)) {
          const profileSnap = await db
            .collection('users')
            .doc(memberUid)
            .collection('data')
            .doc('profile')
            .get();

          const profileData = profileSnap.exists ? profileSnap.data()! : {};
          connectionsMap.set(memberUid, {
            uid: memberUid,
            username: profileData.username || 'unknown',
            displayName: profileData.displayName || profileData.display_name || undefined,
          });
        }
      }
    });

    await Promise.all(fetchPromises);

    return { connections: Array.from(connectionsMap.values()) };
  } catch (err: any) {
    console.error('Error in getConnections:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to fetch connections');
  }
});
