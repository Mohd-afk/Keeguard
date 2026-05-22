import { useState, useEffect } from 'react';
import { X, CheckSquare, BellOff, Loader2 } from 'lucide-react';
import { addNotificationsListener, markAllAsRead, getNotifications } from '../../stores/notificationsStore';
import { type AppNotification } from '../../firestore/notifications';
import { NotificationCard } from './NotificationCard';
import { InviteDetailSheet } from './InviteDetailSheet';
import { toast } from 'sonner';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<AppNotification | null>(null);

  useEffect(() => {
    if (!open) return;

    // Subscribe to real-time notification list updates
    const unsubscribe = addNotificationsListener((notifs) => {
      setNotifications(notifs);
    });
    return unsubscribe;
  }, [open]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await markAllAsRead();
      toast.success('All notifications marked as read');
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark notifications read');
    } finally {
      setLoading(false);
    }
  };

  // Split notifications into Actionable (Urgent, High or Pending Invites) vs Log (Others)
  const actionableNotifs = notifications.filter((n) => {
    return (
      n.status === 'pending' &&
      (n.priority === 'high' ||
        n.priority === 'urgent' ||
        n.type_category === 'collaboration')
    );
  });

  const generalLogNotifs = notifications.filter((n) => {
    return !actionableNotifs.some((act) => act.id === n.id);
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`absolute top-0 right-0 z-50 h-full w-[360px] max-w-[90vw] bg-[#16213e]/98 backdrop-blur-md flex flex-col shadow-2xl border-l border-white/5 transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),_16px)] pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-bold text-lg">Notifications</h2>
            {notifications.filter((n) => n.status === 'pending').length > 0 && (
              <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                {notifications.filter((n) => n.status === 'pending').length} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {notifications.some((n) => n.status === 'pending') && (
              <button
                disabled={loading}
                onClick={handleMarkAllRead}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                title="Mark all read"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                ) : (
                  <CheckSquare className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-500 animate-pulse">
                <BellOff className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">All caught up!</h3>
                <p className="text-gray-500 text-xs mt-1 max-w-[200px]">
                  No notifications yet. You will see shares, alerts and invites here.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Actionable / High Priority Tray */}
              {actionableNotifs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-cyan-400 text-[10px] font-extrabold uppercase tracking-wider pl-1">
                    Attention Required
                  </h3>
                  <div className="space-y-2">
                    {actionableNotifs.map((notif) => (
                      <NotificationCard
                        key={notif.id}
                        notification={notif}
                        onOpenInviteDetail={(n) => setSelectedInvite(n)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* General Activity Log Tray */}
              {generalLogNotifs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-gray-500 text-[10px] font-extrabold uppercase tracking-wider pl-1">
                    Activity Log
                  </h3>
                  <div className="space-y-2">
                    {generalLogNotifs.map((notif) => (
                      <NotificationCard
                        key={notif.id}
                        notification={notif}
                        onOpenInviteDetail={(n) => setSelectedInvite(n)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Invite Detail Sheet */}
      {selectedInvite && (
        <InviteDetailSheet
          inviteNotification={selectedInvite}
          onClose={() => setSelectedInvite(null)}
        />
      )}
    </>
  );
}
