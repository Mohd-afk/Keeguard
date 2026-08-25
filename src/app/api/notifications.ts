// PURPOSE: Provides implementation and configuration for notifications.ts.
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

export async function respondToShareRequest(notificationId: string, accept: boolean): Promise<void> {
  const fns = getFirebaseFunctions();
  const callable = httpsCallable<{ notificationId: string; accept: boolean }, void>(fns, 'respondToShareRequest');
  await callable({ notificationId, accept });
}
