import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { ArrowLeft, Smartphone, MoreVertical, ArrowUpRight, FolderHeart, ShieldAlert, Loader2, CheckSquare, UserCheck, XCircle, Bell, Activity } from 'lucide-react';
import { addNotificationsListener, markAsRead } from '@/app/stores/notificationsStore';
import { type AppNotification } from '@/app/firestore/notifications';
import { acceptInvite, declineInvite } from '@/app/api/collections';
import { InviteDetailSheet } from '@/ui/compositions/InviteDetailSheet';
import { BottomNav } from '@/ui/layout/BottomNav';
import { toast } from 'sonner';

export function PendingRequests() {
  const navigate = useNavigate();
  const { setSidebarOpen, user } = useOutletContext<{
    setSidebarOpen: (o: boolean) => void;
    user: any;
  }>();

  const [realNotifications, setRealNotifications] = useState<AppNotification[]>([]);
  const [selectedInvite, setSelectedInvite] = useState<AppNotification | null>(null);
  
  // Interactive mock state to replicate image_0.png exactly
  const [showMockCard, setShowMockCard] = useState(true);
  const [loadingMock, setLoadingMock] = useState(false);
  const [showMenuId, setShowMenuId] = useState<string | null>(null);

  // Per-invite loading state for inline accept/decline
  const [loadingInviteId, setLoadingInviteId] = useState<{ id: string; action: 'accept' | 'decline' } | null>(null);

  // Subscribe to real-time notification list updates
  useEffect(() => {
    const unsubscribe = addNotificationsListener((notifs) => {
      setRealNotifications(notifs);
    });
    return unsubscribe;
  }, []);

  // Helper to aggregate duplicate/consecutive notifications
  const aggregateNotifications = (notifications: AppNotification[]): AppNotification[] => {
    const aggregated: AppNotification[] = [];
    
    notifications.forEach((notif) => {
      if (notif.type !== 'invite_received') {
        // Only aggregate non-invite notifications (e.g. system alerts, item edits)
        const last = aggregated[aggregated.length - 1];
        const notifTime = notif.created_at?.toDate ? notif.created_at.toDate().getTime() : new Date(notif.created_at).getTime();
        const lastTime = last ? (last.created_at?.toDate ? last.created_at.toDate().getTime() : new Date(last.created_at).getTime()) : 0;
        
        if (
          last &&
          last.type === notif.type &&
          last.metadata?.collection_id === notif.metadata?.collection_id &&
          last.metadata?.inviter_user_id === notif.metadata?.inviter_user_id &&
          Math.abs(notifTime - lastTime) < 5 * 60 * 1000 // 5-minute window
        ) {
          const count = (last.metadata?.count || 1) + 1;
          last.metadata = {
            ...last.metadata,
            count,
          };
          last.body = `${last.metadata?.inviter_display_name || 'Collaborator'} performed ${count} updates in "${last.metadata?.collection_name || 'the shared vault'}".`;
          return;
        }
      }
      aggregated.push({ ...notif });
    });
    
    return aggregated;
  };

  // Filter actual collaboration pending notifications
  const aggregatedNotifications = aggregateNotifications(realNotifications);
  const realInvites = aggregatedNotifications.filter(
    (n) => n.status === 'pending' && n.type_category === 'collaboration'
  );
  const otherNotifications = aggregatedNotifications.filter(
    (n) => !(n.status === 'pending' && n.type_category === 'collaboration')
  );

  const totalPendingCount = realInvites.length + (showMockCard ? 1 : 0);
  const unreadCount = aggregatedNotifications.filter((n) => n.status === 'pending').length + (showMockCard ? 1 : 0);

  const handleGrantMockAccess = () => {
    setLoadingMock(true);
    setTimeout(() => {
      setLoadingMock(false);
      setShowMockCard(false);
      toast.success('Notifications access granted successfully!', {
        description: 'You will now receive payment updates and secure folder invites.',
        duration: 4000,
      });
    }, 1200);
  };

  const handleDismissMock = () => {
    setShowMockCard(false);
    setShowMenuId(null);
    toast.info('Request dismissed');
  };

  const handleAcceptInvite = async (invite: AppNotification) => {
    const collectionId = invite.metadata?.collection_id;
    const inviteId = invite.metadata?.invite_id;
    if (!collectionId || !inviteId) {
      toast.error('Missing invitation details. Cannot accept.');
      return;
    }
    setLoadingInviteId({ id: invite.id, action: 'accept' });
    try {
      await acceptInvite(collectionId, inviteId);
      // Mark the notification as read after accepting
      try { await markAsRead(invite.id); } catch (_) {}
      toast.success('Invitation accepted!', {
        description: `You now have access to "${invite.metadata?.collection_name || 'the shared vault'}".`,
        duration: 4000,
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept invitation');
    } finally {
      setLoadingInviteId(null);
    }
  };

  const handleDeclineInvite = async (invite: AppNotification) => {
    const collectionId = invite.metadata?.collection_id;
    const inviteId = invite.metadata?.invite_id;
    if (!collectionId || !inviteId) {
      toast.error('Missing invitation details. Cannot decline.');
      return;
    }
    setLoadingInviteId({ id: invite.id, action: 'decline' });
    try {
      await declineInvite(collectionId, inviteId);
      try { await markAsRead(invite.id); } catch (_) {}
      toast.info('Invitation declined');
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline invitation');
    } finally {
      setLoadingInviteId(null);
    }
  };

  return (
    <div className="h-screen max-h-screen bg-[#1a1a2e] flex flex-col animate-page overflow-hidden select-none">
      
      {/* Sticky Premium Header Row */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3 h-14">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            aria-label="Go back to Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-semibold text-base">Notifications</span>
        </div>
      </div>

      {/* Main Scroll Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_96px)]">
        
        {/* Main Title Row with associated premium circular badge */}
        <div className="flex items-center gap-3 mb-6 px-1">
          <h1 className="text-white text-2xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-cyan-500 text-[#1a1a2e] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center animate-in zoom-in duration-200">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* Section Labels: COMPLETE SETUP with dark badge */}
        <div className="flex items-center justify-between mb-3.5 px-1.5">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">
            Complete Setup
          </span>
          {totalPendingCount > 0 && (
            <span className="bg-white/5 text-gray-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {totalPendingCount} pending
            </span>
          )}
        </div>

        {/* Actionable Notification cards stack */}
        <div className="space-y-3">
          
          {/* 1. Replicated Card Pattern (Mock Interactive fallback) */}
          {showMockCard && (
            <div className="group relative bg-[#16213e] border border-white/5 rounded-2xl p-4.5 flex flex-col gap-3.5 shadow-lg transition-all duration-300 hover:border-cyan-500/20">
              
              <div className="flex gap-3.5">
                {/* Left: Smartphone outline container */}
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 transition-transform duration-200 group-hover:scale-105">
                  <Smartphone className="w-5 h-5" />
                </div>

                {/* Middle: Bold title & descriptive text */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-xs font-bold tracking-tight pr-5">
                    Grant notifications access
                  </h3>
                  <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">
                    Never miss an important payment update ever again.
                  </p>
                </div>

                {/* Right: Vertical three-dot overflow menu */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowMenuId(showMenuId === 'mock' ? null : 'mock')}
                    className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showMenuId === 'mock' && (
                    <div className="absolute right-0 mt-1 w-28 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        onClick={handleDismissMock}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors font-medium"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom action button */}
              <div className="pl-[54px]">
                <button
                  onClick={handleGrantMockAccess}
                  disabled={loadingMock}
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors text-xs font-bold active:scale-[0.98]"
                >
                  {loadingMock ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <>
                      <span>Grant Access</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 2. Real Firestore Folder Sharing Pending Invitations */}
          {realInvites.map((invite) => {
            const isLoadingAccept = loadingInviteId?.id === invite.id && loadingInviteId?.action === 'accept';
            const isLoadingDecline = loadingInviteId?.id === invite.id && loadingInviteId?.action === 'decline';
            const isAnyLoading = !!(isLoadingAccept || isLoadingDecline);

            const inviterName = invite.metadata?.inviter_display_name || invite.metadata?.inviter_username || 'Someone';
            const folderName = invite.metadata?.collection_name || 'Shared Vault';
            
            let roleDisplay = 'Collaborator';
            if (invite.metadata?.role === 'viewer' || invite.body.toLowerCase().includes('viewer')) {
              roleDisplay = 'Viewer';
            }

            return (
              <div
                key={invite.id}
                className="group relative bg-[#16213e] border border-white/5 rounded-2xl p-4.5 flex flex-col gap-3.5 shadow-lg transition-all duration-300 hover:border-cyan-500/20"
              >
                <div className="flex gap-3.5">
                  {/* Left: Avatar initial */}
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 text-xs font-bold uppercase transition-transform duration-200 group-hover:scale-105">
                    {inviterName[0]}
                  </div>

                  {/* Middle: Invite Header and details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-xs font-bold tracking-tight pr-5">
                      {inviterName} wants to share a folder
                    </h3>
                    <div className="text-gray-400 text-[11px] mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span>Folder: <span className="text-white font-semibold">{folderName}</span></span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        Role: 
                        <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                          {roleDisplay}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Right: vertical three-dot menu */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowMenuId(showMenuId === invite.id ? null : invite.id)}
                      className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {showMenuId === invite.id && (
                      <div className="absolute right-0 mt-1 w-36 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          onClick={() => {
                            setSelectedInvite(invite);
                            setShowMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors font-medium"
                        >
                          View Details
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await markAsRead(invite.id);
                              setShowMenuId(null);
                              toast.success('Notification marked as read');
                            } catch (e) {
                              toast.error('Failed to update notification');
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors font-medium"
                        >
                          Mark Read
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom: Inline Accept / Decline action row */}
                <div className="pl-[54px] flex items-center gap-2.5">
                  <button
                    onClick={() => handleDeclineInvite(invite)}
                    disabled={isAnyLoading}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-3 py-1.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoadingDecline ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    Decline
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={isAnyLoading}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/20 px-3 py-1.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                  >
                    {isLoadingAccept ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    Accept
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty State placeholder */}
          {totalPendingCount === 0 && (
            <div className="py-7 text-center text-gray-500 border border-dashed border-white/5 rounded-2xl bg-[#16213e]/20 px-6">
              <CheckSquare className="w-6 h-6 mx-auto mb-2 text-cyan-400/20" />
              <h3 className="text-white font-medium text-xs">All setups complete!</h3>
            </div>
          )}
        </div>

        {/* Section Labels: RECENT ACTIVITY */}
        {otherNotifications.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3.5 mt-7 px-1.5">
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                Recent Activity
              </span>
            </div>
            <div className="space-y-3">
              {otherNotifications.map((notification) => {
                const isUnread = notification.status === 'pending';
                return (
                  <div
                    key={notification.id}
                    className={`group relative bg-[#16213e] border ${isUnread ? 'border-cyan-500/20' : 'border-white/5'} rounded-2xl p-4 flex flex-col gap-3.5 shadow-lg transition-all duration-300 hover:border-cyan-500/20`}
                  >
                    <div className="flex gap-3.5 items-center">
                      <div className={`w-10 h-10 rounded-xl ${isUnread ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-white/5 text-gray-400 border-white/10'} border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105`}>
                        <Activity className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-xs font-bold leading-normal pr-5 ${isUnread ? 'text-white font-semibold' : 'text-gray-300'}`}>
                          {notification.body}
                        </h3>
                        <p className="text-gray-500 text-[10px] mt-1 leading-relaxed">
                          {new Date(notification.created_at?.toDate ? notification.created_at.toDate() : notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setShowMenuId(showMenuId === notification.id ? null : notification.id)}
                          className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {showMenuId === notification.id && (
                          <div className="absolute right-0 mt-1 w-32 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                            {isUnread && (
                              <button
                                onClick={async () => {
                                  try {
                                    await markAsRead(notification.id);
                                    setShowMenuId(null);
                                  } catch (e) {}
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-cyan-400 hover:bg-white/5 transition-colors font-medium"
                              >
                                Mark as Read
                              </button>
                            )}
                            <button
                              onClick={() => setShowMenuId(null)}
                              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-white/5 transition-colors font-medium"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* standard bottom nav overlay */}
      <BottomNav
        active="safe"
        onChange={(tab) => {
          if (tab === 'security') navigate('/security');
          else if (tab === 'tools') navigate('/generator');
          else navigate('/');
        }}
      />

      {/* Real Invite detail bottom sheet */}
      {selectedInvite && (
        <InviteDetailSheet
          inviteNotification={selectedInvite}
          onClose={() => setSelectedInvite(null)}
        />
      )}
    </div>
  );
}
