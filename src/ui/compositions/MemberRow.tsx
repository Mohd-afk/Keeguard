// PURPOSE: Renders the MemberRow screen interface component and user actions.
import { useState } from 'react';
import { User, Trash2, Edit2, Loader2, Check, X, Shield } from 'lucide-react';
import { type CollectionMember, type CollectionRole } from '@/app/firestore/collections';
import { toast } from 'sonner';

interface MemberRowProps {
  member: CollectionMember;
  currentUserRole: CollectionRole;
  currentUserId: string;
  onRemove: (userId: string) => Promise<void>;
  onChangeRole: (userId: string, newRole: CollectionRole) => Promise<void>;
}

export function MemberRow({
  member,
  currentUserRole,
  currentUserId,
  onRemove,
  onChangeRole,
}: MemberRowProps) {
  const [editing, setEditing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<CollectionRole>(member.role);
  const [loading, setLoading] = useState(false);

  const isMe = member.user_id === currentUserId;
  const isOwner = member.role === 'owner';

  // Role permissions check
  const canModify = () => {
    if (isOwner) return false; // Nobody can modify the owner
    if (isMe) return false;    // Cannot modify oneself (prevents lockouts)
    
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'manager') {
      // Managers can only modify editors and viewers
      return member.role === 'editor' || member.role === 'viewer';
    }
    return false;
  };

  const getRoleBadge = (role: CollectionRole) => {
    switch (role) {
      case 'owner':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'manager':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'editor':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'viewer':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const handleSaveRole = async () => {
    if (selectedRole === member.role) {
      setEditing(false);
      return;
    }
    setLoading(true);
    try {
      await onChangeRole(member.user_id, selectedRole);
      toast.success('Member role updated successfully');
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member role');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!window.confirm(`Are you sure you want to remove ${member.display_name || member.username} from this collection?`)) {
      return;
    }
    setLoading(true);
    try {
      await onRemove(member.user_id);
      toast.success('Member removed from collection');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3.5 bg-[#16213e]/60 border border-white/5 rounded-2xl gap-3">
      {/* Left side: Avatar + Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
          <User className="w-4 h-4" />
        </div>
        
        <div className="min-w-0">
          <p className="text-white text-xs font-bold truncate flex items-center gap-1.5">
            {member.display_name || member.username}
            {isMe && (
              <span className="text-[9px] bg-white/10 text-gray-300 px-1 py-0.5 rounded font-normal">
                You
              </span>
            )}
          </p>
          <p className="text-gray-500 text-[10px] truncate mt-0.5">
            @{member.username}
          </p>
        </div>
      </div>

      {/* Middle/Right side: Badges and Operations */}
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <div className="flex items-center gap-1 bg-[#1a1a2e] border border-white/10 p-1 rounded-xl">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as CollectionRole)}
              className="bg-transparent text-white text-xs font-semibold focus:outline-none px-2.5 py-1"
            >
              <option value="manager" className="bg-[#1a1a2e]">Manager</option>
              <option value="editor" className="bg-[#1a1a2e]">Editor</option>
              <option value="viewer" className="bg-[#1a1a2e]">Viewer</option>
            </select>
            
            <button
              onClick={handleSaveRole}
              disabled={loading}
              className="p-1 rounded bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
            </button>
            
            <button
              onClick={() => { setEditing(false); setSelectedRole(member.role); }}
              disabled={loading}
              className="p-1 rounded hover:bg-white/5 text-gray-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            {/* Role Badge */}
            <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getRoleBadge(member.role)}`}>
              {member.role}
            </span>

            {/* Editing buttons (only if permitted) */}
            {canModify() && (
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  title="Change member role"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRemoveMember}
                  className="p-1.5 rounded hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition-colors"
                  title="Remove from collection"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
