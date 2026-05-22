// ─── Shared Collections Notifications Firestore Data Layer ────────────────────
// Handles client-side subscription and updates for user notifications.
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  getDocs,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('FIRESTORE_NOTIFICATIONS');

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationCategory = 'collaboration' | 'security' | 'system';
export type NotificationStatus = 'pending' | 'read' | 'archived';

export interface AppNotification {
  id: string;
  user_id: string;
  type: 'invite_received' | 'invite_accepted' | 'member_removed' | 'security_alert' | 'system';
  priority: NotificationPriority;
  type_category: NotificationCategory;
  title: string;
  body: string;
  status: NotificationStatus;
  created_at: any; // Firestore Timestamp
  read_at: any | null; // Firestore Timestamp
  metadata: {
    collection_id?: string;
    collection_name?: string;
    invite_id?: string;
    inviter_user_id?: string;
    inviter_username?: string;
    inviter_display_name?: string;
    device_id?: string;
    device_name?: string;
    ip_address?: string;
    [key: string]: any;
  };
}

// ── Firestore path helpers ────────────────────────────────────────────────────

function notificationsRef(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'notifications');
}

function notificationRef(userId: string, notificationId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'notifications', notificationId);
}

// ── Notifications operations ──────────────────────────────────────────────────

/**
 * Subscribe to the user's notification list, sorted newest first.
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
): Unsubscribe {
  log.info('Subscribing to notifications', { userId });
  const q = query(
    notificationsRef(userId),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(q, (snap) => {
    const notifications: AppNotification[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as AppNotification));
    log.debug('Notifications snapshot received', { userId, count: notifications.length });
    callback(notifications);
  }, (err) => {
    log.error('Notifications snapshot error', { userId, err });
  });
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  log.info('Marking notification as read', { userId, notificationId });
  const ref = notificationRef(userId, notificationId);
  await updateDoc(ref, {
    status: 'read',
    read_at: serverTimestamp(),
  });
  log.debug('Notification marked as read');
}

/**
 * Mark all pending notifications for a user as read.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  log.info('Marking all notifications as read', { userId });
  const q = query(notificationsRef(userId), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  
  if (snap.empty) return;

  const { writeBatch } = await import('firebase/firestore');
  const batch = writeBatch(getFirebaseDb());
  
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      status: 'read',
      read_at: serverTimestamp(),
    });
  });

  await batch.commit();
  log.info('All notifications marked as read', { count: snap.size });
}

/**
 * Get count of unread actionable/urgent/high-priority notifications.
 * Actionable is defined by the spec as priority high/urgent OR type collaboration and pending.
 */
export async function getUnreadActionableCount(userId: string): Promise<number> {
  log.debug('Fetching unread actionable count', { userId });
  const q = query(notificationsRef(userId), where('status', '==', 'pending'));
  const snap = await getDocs(q);

  let count = 0;
  snap.docs.forEach((d) => {
    const notif = d.data() as Omit<AppNotification, 'id'>;
    const isActionable =
      notif.priority === 'high' ||
      notif.priority === 'urgent' ||
      (notif.type_category === 'collaboration' && notif.status === 'pending');
    
    if (isActionable) {
      count++;
    }
  });

  return count;
}
