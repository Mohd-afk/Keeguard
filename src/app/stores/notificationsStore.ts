// ─── Notifications Store ──────────────────────────────────────────────────────
// Reactive in-memory state store for user notifications.
// Subscribes to Firestore notifications subcollection and tracks unread badges.
// ─────────────────────────────────────────────────────────────────────────────

import { onAuthChange, getCurrentUser } from '../auth';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../firestore/notifications';
import { createLogger } from '../utils/logger';

const log = createLogger('STORE_NOTIFICATIONS');

let _notifications: AppNotification[] = [];
let _unreadActionableCount = 0;
let _unsubscribeNotifications: (() => void) | null = null;
let _changeListeners: Array<(notifications: AppNotification[], unreadActionableCount: number) => void> = [];

// Handle auto-subscription on sign-in / cleanup on sign-out
onAuthChange((user) => {
  if (user) {
    log.info('User signed in, initializing notifications listener', { uid: user.uid });
    if (_unsubscribeNotifications) {
      _unsubscribeNotifications();
    }

    _unsubscribeNotifications = subscribeToNotifications(user.uid, (notifs) => {
      _notifications = notifs;

      // Unread Actionable alert count: High/Urgent OR Collaboration-category pending
      _unreadActionableCount = notifs.filter((n) => {
        const isActionable =
          n.priority === 'high' ||
          n.priority === 'urgent' ||
          (n.type_category === 'collaboration' && n.status === 'pending');
        return isActionable;
      }).length;

      notifyChangeListeners();
    });
  } else {
    log.info('User signed out, cleaning up notifications store');
    if (_unsubscribeNotifications) {
      _unsubscribeNotifications();
      _unsubscribeNotifications = null;
    }
    _notifications = [];
    _unreadActionableCount = 0;
    notifyChangeListeners();
  }
});

function notifyChangeListeners(): void {
  log.debug('Notifying notifications change listeners', {
    listenerCount: _changeListeners.length,
    unreadActionableCount: _unreadActionableCount,
  });
  _changeListeners.forEach((l) => l(_notifications, _unreadActionableCount));
}

// ── Read operations ──────────────────────────────────────────────────────────

export function getNotifications(): AppNotification[] {
  return _notifications;
}

export function getUnreadActionableCount(): number {
  return _unreadActionableCount;
}

/**
 * Register a listener to reactive updates of the notification list.
 * Returns an unsubscribe callback.
 */
export function addNotificationsListener(
  listener: (notifications: AppNotification[], unreadActionableCount: number) => void,
): () => void {
  _changeListeners.push(listener);
  // Fire immediately to synchronize the component's local state on mount
  listener(_notifications, _unreadActionableCount);
  return () => {
    _changeListeners = _changeListeners.filter((l) => l !== listener);
  };
}

// ── Mutation operations (via firestore/callable) ──────────────────────────────

export async function markAsRead(notificationId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Must be authenticated to mark notifications as read.');
  }
  await markNotificationRead(user.uid, notificationId);
}

export async function markAllAsRead(): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Must be authenticated to mark all notifications as read.');
  }
  await markAllNotificationsRead(user.uid);
}
