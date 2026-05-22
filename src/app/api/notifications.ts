// ─── Notifications API Client Wrapper ────────────────────────────────────────
// Frontend wrapper to invoke notifications Cloud Function.
// ─────────────────────────────────────────────────────────────────────────────

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';

export async function markNotificationReadCallable(notificationId: string): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ notificationId: string }, void>(fns, 'markNotificationRead');
  await callable({ notificationId });
}
