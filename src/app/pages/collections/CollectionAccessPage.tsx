import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router';
import { ArrowLeft, Users, ShieldAlert, Loader2, Send, Mail, UserMinus, Plus } from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  setActiveCollectionId,
  getActiveCollectionMembers,
  getActiveCollectionInvites,
  addAccessChangeListener,
  sendInvite,
  revokeInvite,
  changeMemberRole,
  removeMember
} from '../../stores/accessStore';
import { subscribeToSharedCollection, type SharedCollection } from '../../firestore/collections';
import { InviteByUsernameInput } from '../../components/collections/InviteByUsernameInput';
import { RoleSelect } from '../../components/collections/RoleSelect';
import { MemberRow } from '../../components/collections/MemberRow';
import { StepUpAuthModal } from '../../components/auth/StepUpAuthModal';
import { type UserSearchResult } from '../../api/users';
import { toast } from 'sonner';

interface OutletContext {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function CollectionAccessPage() {
  const { id: collectionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useOutletContext<OutletContext>();

  const [collection, setCollection] = useState<SharedCollection | null>(null);
  const [members, setMembers] = useState(getActiveCollectionMembers());
  const [invites, setInvites] = useState(getActiveCollectionInvites());
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedRole, setSelectedRole] = useState<'manager' | 'editor' | 'viewer'>('editor');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showInviteSection, setShowInviteSection] = useState(false);

  // Step-up verification state
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpAction, setStepUpAction] = useState<(() => Promise<void>) | null>(null);
  const [stepUpDescription, setStepUpDescription] = useState('');

  // 1. Initialize Active Collection in Access Store & Subscribe
  useEffect(() => {
    if (!collectionId) return;

    // Set the active collection ID which spins up Firestore Snapshot listeners in the store
    setActiveCollectionId(collectionId);

    // Subscribe to metadata updates
    const unsubCol = subscribeToSharedCollection(collectionId, (col) => {
      setCollection(col);
      setLoading(false);
    });

    // Subscribe to store access changes (members and pending invites updates)
    const unsubAccess = addAccessChangeListener(() => {
      setMembers(getActiveCollectionMembers());
      setInvites(getActiveCollectionInvites());
    });

    return () => {
      // Cleanup: clear active collection, unsubscribing from all snapshot listeners
      setActiveCollectionId(null);
      unsubCol();
      unsubAccess();
    };
  }, [collectionId]);

  // Find the current logged in user's role in this collection to pass to member rows
  const currentUserMember = members.find((m) => m.user_id === user.uid);
  const currentUserRole = currentUserMember ? currentUserMember.role : 'viewer';

  // Permission check: Can current user invite or manage roles?
  // Only owner and manager are allowed to send invites or manage access.
  const canManageAccess = currentUserRole === 'owner' || currentUserRole === 'manager';

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      toast.error('Please select a user to invite');
      return;
    }

    setInviting(true);
    try {
      await sendInvite(selectedUser.username, selectedRole, inviteMessage.trim() || undefined);
      toast.success(`Invite sent successfully to @${selectedUser.username}`);
      setSelectedUser(null);
      setInviteMessage('');
      setShowInviteSection(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string, username: string) => {
    const confirm = window.confirm(`Are you sure you want to revoke the pending invite for @${username}?`);
    if (!confirm) return;

    try {
      await revokeInvite(inviteId);
      toast.success(`Invite for @${username} revoked`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to revoke invite');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    const memberName = members.find((m) => m.user_id === targetUserId)?.username || 'this member';
    setStepUpDescription(`remove @${memberName} from this vault`);
    setStepUpAction(() => async () => {
      try {
        await removeMember(targetUserId);
        toast.success(`Member @${memberName} has been removed`);
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || 'Failed to remove member');
      }
    });
    setStepUpOpen(true);
  };

  const handleChangeMemberRole = async (targetUserId: string, newRole: any) => {
    const memberName = members.find((m) => m.user_id === targetUserId)?.username || 'this member';
    setStepUpDescription(`change @${memberName}'s role to ${newRole}`);
    setStepUpAction(() => async () => {
      try {
        await changeMemberRole(targetUserId, newRole);
        toast.success(`Role for @${memberName} updated to ${newRole}`);
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || 'Failed to update member role');
      }
    });
    setStepUpOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 animate-pulse" />
        <h2 className="text-white font-bold text-lg">Shared Vault Not Found</h2>
        <p className="text-gray-500 text-xs mt-2 max-w-[280px]">
          The collection you are trying to configure does not exist or you lack administrative privileges.
        </p>
        <button
          onClick={() => navigate('/collections')}
          className="mt-6 py-2 px-5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white text-xs font-bold transition-all"
        >
          Back to Vaults
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate(`/collections/${collectionId}`)}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors shrink-0"
            aria-label="Back to vault detail"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white text-base font-bold truncate">Vault Access</h1>
            <p className="text-gray-500 text-[10px] truncate leading-none mt-0.5">
              {collection.name}
            </p>
          </div>
        </div>

        {canManageAccess && (
          <button
            onClick={() => setShowInviteSection(!showInviteSection)}
            className="p-1.5 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/20 active:scale-95 flex items-center gap-1 text-xs font-bold shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Invite
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        
        {/* Dynamic Slide-in Invite Section */}
        {showInviteSection && canManageAccess && (
          <form
            onSubmit={handleSendInvite}
            className="bg-[#16213e] border border-[#22d3ee]/20 p-4 rounded-2xl space-y-4 shadow-xl animate-in slide-in-from-top duration-300 relative overflow-hidden"
          >
            {/* Ambient secure border accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent" />
            
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-cyan-400" />
                Invite Collaborator
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteSection(false)}
                className="text-xs text-gray-500 hover:text-white font-semibold"
              >
                Cancel
              </button>
            </div>

            <InviteByUsernameInput
              onSelectUser={(u) => setSelectedUser(u)}
              selectedUser={selectedUser}
            />

            {selectedUser && (
              <>
                <RoleSelect value={selectedRole} onChange={(r) => setSelectedRole(r)} />

                <div>
                  <label className="text-gray-400 text-xs font-semibold mb-1.5 block">
                    Message (Optional)
                  </label>
                  <input
                    type="text"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder="Provide a quick note..."
                    maxLength={100}
                    className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2 px-3 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={inviting}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
                >
                  {inviting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Invitation...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Secure Invite
                    </>
                  )}
                </button>
              </>
            )}
          </form>
        )}

        {/* 1. Active Members List */}
        <div className="space-y-2">
          <h3 className="text-gray-500 text-[10px] font-extrabold uppercase tracking-wider pl-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            Active Members ({members.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                currentUserRole={currentUserRole}
                currentUserId={user.uid}
                onRemove={handleRemoveMember}
                onChangeRole={handleChangeMemberRole}
              />
            ))}
          </div>
        </div>

        {/* 2. Pending Invites List */}
        {invites.length > 0 && (
          <div className="space-y-2 pt-2 animate-in fade-in duration-300">
            <h3 className="text-gray-500 text-[10px] font-extrabold uppercase tracking-wider pl-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              Pending Invites ({invites.length})
            </h3>
            
            <div className="flex flex-col gap-2.5">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3.5 bg-[#16213e]/40 border border-dashed border-white/10 rounded-2xl gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-bold truncate">
                      @{invite.invited_user_id || 'Username'}
                    </p>
                    <p className="text-gray-500 text-[9px] mt-0.5">
                      Invited to be <span className="text-cyan-400 font-bold uppercase">{invite.role}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/10 text-[8px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      Pending
                    </span>
                    {canManageAccess && (
                      <button
                        onClick={() => handleRevokeInvite(invite.id, invite.invited_user_id)}
                        className="p-1.5 bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                        title="Revoke Pending Invite"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <StepUpAuthModal
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onSuccess={() => {
          if (stepUpAction) {
            stepUpAction();
          }
        }}
        actionDescription={stepUpDescription}
      />
    </div>
  );
}
