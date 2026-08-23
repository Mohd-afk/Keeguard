import { useState } from 'react';
import { Shield, Users, Bell, Eye, EyeOff, Calendar, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { type AppNotification } from '@/app/firestore/notifications';
import { markAsRead } from '@/app/stores/notificationsStore';
import { toast } from 'sonner';

interface NotificationCardProps {
  notification: AppNotification;
  onOpenInviteDetail: (notif: AppNotification) => void;
}

export function NotificationCard({ notification, onOpenInviteDetail }: NotificationCardProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isUnread = notification.status === 'pending';
  const isInvite = notification.type === 'invite_received';
  const isSecurity = notification.type_category === 'security';

  // Format relative timestamp
  const getRelativeTime = (timestamp: any): string => {
    if (!timestamp) return 'just now';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else {
      date = new Date(timestamp);
    }
    const diffMs = new Date().getTime() - date.getTime();
    const seconds = Math.floor(diffMs / 1000);
    
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleMarkRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUnread || loading) return;
    setLoading(true);
    try {
      await markAsRead(notification.id);
      toast.success('Marked notification read');
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark read');
    } finally {
      setLoading(false);
    }
  };

  // Select icon based on notification characteristics
  const getIcon = () => {
    if (isSecurity) {
      return (
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
          <AlertTriangle className="w-5 h-5" />
        </div>
      );
    }
    if (notification.type_category === 'collaboration') {
      return (
        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
          <Users className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-xl bg-gray-500/10 text-gray-400 flex items-center justify-center shrink-0 border border-gray-500/20">
        <Bell className="w-5 h-5" />
      </div>
    );
  };

  return (
    <div
      onClick={() => isInvite && isUnread ? onOpenInviteDetail(notification) : setExpanded(!expanded)}
      className={`group flex flex-col p-3 rounded-2xl border transition-all duration-200 cursor-pointer ${
        isUnread
          ? isSecurity
            ? 'bg-rose-500/5 hover:bg-rose-500/8 border-rose-500/15'
            : isInvite
            ? 'bg-cyan-500/5 hover:bg-cyan-500/8 border-cyan-500/15'
            : 'bg-white/5 hover:bg-white/8 border-white/5'
          : 'bg-[#16213e]/40 hover:bg-[#16213e]/70 border-white/5'
      }`}
    >
      <div className="flex gap-3">
        {/* Category Icon */}
        {getIcon()}

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <h4 className={`text-sm truncate leading-tight ${isUnread ? 'text-white font-semibold' : 'text-gray-300 font-medium'}`}>
              {notification.title}
            </h4>
            
            {/* Action Indicators */}
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              {isUnread && (
                <button
                  onClick={handleMarkRead}
                  disabled={loading}
                  className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Mark read"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              {isUnread && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSecurity ? 'bg-rose-500 animate-pulse' : 'bg-cyan-400'}`} />
              )}
            </div>
          </div>

          <p className={`text-xs mt-1 leading-normal break-words ${isUnread ? 'text-gray-200' : 'text-gray-500'} ${expanded ? '' : 'line-clamp-2'}`}>
            {notification.body}
          </p>

          {/* Sub-meta details row */}
          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-500 font-medium">
            <span>{getRelativeTime(notification.created_at)}</span>
            {notification.metadata?.collection_name && (
              <>
                <span>•</span>
                <span className="text-cyan-400/80 truncate max-w-[100px]">
                  {notification.metadata.collection_name}
                </span>
              </>
            )}
            {!isInvite && (
              <>
                <span className="ml-auto p-0.5 hover:text-white rounded">
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail box (non-invites) */}
      {expanded && !isInvite && (
        <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {notification.metadata?.device_name && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Device</span>
              <span className="text-gray-300 font-medium">{notification.metadata.device_name}</span>
            </div>
          )}
          {notification.metadata?.ip_address && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">IP Address</span>
              <span className="text-gray-300 font-medium">{notification.metadata.ip_address}</span>
            </div>
          )}
          {notification.metadata?.inviter_username && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Initiated By</span>
              <span className="text-gray-300 font-medium">@{notification.metadata.inviter_username}</span>
            </div>
          )}
        </div>
      )}

      {/* Invite Pending inline action suggestion */}
      {isInvite && isUnread && (
        <div className="mt-2.5 pt-2 border-t border-cyan-500/10 flex items-center justify-between text-[10px] text-cyan-400 font-semibold group-hover:text-cyan-300">
          <span>Action Required: Review Invite</span>
          <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25">View</span>
        </div>
      )}
    </div>
  );
}
