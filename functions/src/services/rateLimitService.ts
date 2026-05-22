// ─── Rate Limiting Service ───────────────────────────────────────────────────
// Implements Firestore-backed rolling window rate-limiting for backend callables.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

export interface RateLimitConfig {
  limit: number;
  windowMs: number; // e.g. 3600000 for 1 hour, 60000 for 1 minute
  errorMessage: string;
}

/**
 * Check if the operation exceeds rate limit. If it does, throws an HttpsError.
 * 
 * @param rateLimitId  Unique identifier for the rate limit target (e.g. "searchUsers_uid" or "createInvite_cid")
 * @param config       Limit configuration details
 */
export async function checkRateLimit(
  rateLimitId: string,
  config: RateLimitConfig
): Promise<void> {
  const db = admin.firestore();
  const docRef = db.collection('rateLimits').doc(rateLimitId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    const now = Date.now();

    if (!snap.exists) {
      // First operation in window
      transaction.set(docRef, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    const data = snap.data()!;
    const windowStart = data.windowStart || now;
    const count = data.count || 0;

    if (now - windowStart > config.windowMs) {
      // Window expired, reset counter
      transaction.set(docRef, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    if (count >= config.limit) {
      throw new Error(`RATE_LIMIT_EXCEEDED: ${config.errorMessage}`);
    }

    // Increment count
    transaction.update(docRef, {
      count: count + 1,
    });
  });
}
