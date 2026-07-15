import { useState } from 'react';
import { X, Shield, Eye, ShieldAlert, Edit, UserCheck, Loader2 } from 'lucide-react';
import { type AppNotification } from '../../firestore/notifications';
import { acceptInvite, declineInvite } from '../../api/collections';
import { markAsRead } from '../../stores/notificationsStore';
import { toast } from 'sonner';

interface InviteDetailSheetProps {
  inviteNotification: AppNotification;
  onClose: () => void;
}

export function InviteDetailSheet({ inviteNotification, onClose }: InviteDetailSheetProps) {
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  const { metadata } = inviteNotification;
  const collectionId = metadata.collection_id || '';
  const inviteId = metadata.invite_id || '';
  const inviterName = metadata.inviter_display_name || metadata.inviter_username || 'A User';
  const inviterUsername = metadata.inviter_username || '';
  const role = metadata.role || 'viewer';

  const roleDetails: Record<string, { title: string; desc: string; icon: React.ReactNode; color: string }> = {
    viewer: {
      title: 'Viewer',
      desc: 'Can read, copy, and view passwords. Cannot add, edit, or delete items.',
      icon: <Eye className="w-4 h-4 text-emerald-400" />,
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    editor: {
      title: 'Editor',
      desc: 'Can read, add, modify, and delete collection items. Cannot manage members.',
      icon: <Edit className="w-4 h-4 text-cyan-400" />,
      color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    },
    manager: {
      title: 'Manager',
      desc: 'Full read/write permissions. Can invite new members, change roles, and revoke invites.',
      icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
  };

  const currentRole = roleDetails[role.toLowerCase()] || roleDetails.viewer;

  const handleAccept = async () => {
    if (!collectionId || !inviteId) {
      toast.error('Missing invitation metadata');
      return;
    }
    setLoading('accept');
    try {
      await acceptInvite(collectionId, inviteId);
      await markAsRead(inviteNotification.id);
      toast.success('Invitation accepted successfully!');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept invitation');
    } finally {
      setLoading(null);
    }
  };

  const handleDecline = async () => {
    if (!collectionId || !inviteId) {
      toast.error('Missing invitation metadata');
      return;
    }
    setLoading('decline');
    try {
      await declineInvite(collectionId, inviteId);
      await markAsRead(inviteNotification.id);
      toast.success('Invitation declined');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline invitation');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Bottom Sheet */}
      <div className="relative w-full bg-[#16213e] border-t border-white/10 rounded-t-3xl p-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-5 shadow-2xl animate-in slide-in-from-bottom duration-300">
        
        {/* Handle Bar */}
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto -mt-2.5 mb-1 opacity-45" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/25 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
              {inviterName[0].toUpperCase()}
            </div>
            <div>
              <h3 className="text-white font-bold text-base">{inviterName}</h3>
              <p className="text-gray-400 text-xs">@{inviterUsername}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Professional Invitation Banner */}
        <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-4 flex flex-col gap-1.5">
          <p className="text-cyan-400 text-xs font-bold">
            @{inviterUsername || inviterName} wants to share the vault folder "{metadata.collection_name || 'Shared Vault'}" with you.
          </p>
          <p className="text-gray-300 text-xs leading-relaxed">
            Do you agree to join as <strong className="text-white font-semibold">{currentRole.title}</strong>?
          </p>
          {inviteNotification.body && (
            <p className="text-gray-400 text-xs italic mt-1 pt-2 border-t border-cyan-500/15">
              Note: "{inviteNotification.body}"
            </p>
          )}
        </div>

        {/* Metadata Details Blocks */}
        <div className="space-y-4">
          {/* Collection Detail */}
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-gray-400">Vault Collection</span>
            <span className="text-sm font-semibold text-white truncate max-w-[200px]">
              {metadata.collection_name || 'Shared Vault'}
            </span>
          </div>

          {/* Role Offered Card */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Offered Role</span>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${currentRole.color}`}>
                {currentRole.title}
              </span>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex items-start gap-3">
              <div className="p-2 bg-white/5 rounded-lg shrink-0">
                {currentRole.icon}
              </div>
              <p className="text-[11px] text-gray-400 leading-normal">
                {currentRole.desc}
              </p>
            </div>
          </div>

          {/* ZK Security Notice */}
          <div className="flex items-start gap-2.5 bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3 text-cyan-400">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed">
              <strong>Zero-Knowledge Encryption Notice:</strong> Access keys are derived and exchanged purely using client-side cryptography. Your master password never leaves this device.
            </p>
          </div>
        </div>

        {/* Interactive Action Row */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={handleDecline}
            disabled={!!loading}
            className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-gray-400 hover:text-white font-semibold text-sm hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-2"
          >
            {loading === 'decline' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Decline'
            )}
          </button>
          
          <button
            onClick={handleAccept}
            disabled={!!loading}
            className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
          >
            {loading === 'accept' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                Accept Invite
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
