import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import {
  ShieldAlert,
  Users,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Copy,
  Check,
  Ban,
  Unlock,
  AlignJustify,
  ArrowLeft,
  Crown,
  Database,
  ChevronRight,
  X,
  Key,
  LogOut,
  Trash2,
  Mail,
  ShieldCheck,
  Smartphone,
  Calendar,
  Clock,
  Lock,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { getCurrentUser } from '@/app/auth';
import { Capacitor } from '@capacitor/core';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

interface ProviderData {
  providerId: string;
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  disabled: boolean;
  creationTime: string;
  lastSignInTime: string;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  tokensValidAfterTime?: string | null;
  providers: string[];
  providerData?: ProviderData[];
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  totalProfiles: number;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const outletContext = useOutletContext<{
    setSidebarOpen?: (o: boolean) => void;
    user?: any;
  }>() || {};

  const currentUser = getCurrentUser() || outletContext.user;
  const isAuthorized = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Admin Console is web-only — block access entirely on native (Android/iOS)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate('/settings', { replace: true });
    }
  }, [navigate]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  
  // Selected user for modal / details drawer
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Action states inside detail modal
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const fetchAdminData = useCallback(async (isRefresh = false) => {
    if (!currentUser) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`API response error (status ${res.status}): ${text.slice(0, 120)}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load admin dashboard');
      }

      setStats(data.stats);
      setUsers(data.users || []);

      // If a user is currently selected, update their reference in state
      if (selectedUser) {
        const updated = (data.users || []).find((u: AdminUser) => u.uid === selectedUser.uid);
        if (updated) setSelectedUser(updated);
      }
    } catch (err: any) {
      console.error('[Admin Dashboard Error]:', err);
      setError(err.message || 'Failed to connect to Admin API server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, selectedUser]);

  useEffect(() => {
    if (isAuthorized) {
      fetchAdminData();
    }
  }, [isAuthorized]);

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const clearModalNotice = () => {
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
  };

  // ── Admin Actions Handlers ──────────────────────────────────────────────────────────

  const handleToggleDisable = async (user: AdminUser) => {
    if (!currentUser) return;
    clearModalNotice();

    const nextStatus = !user.disabled;
    const confirmText = nextStatus
      ? `Are you sure you want to SUSPEND login access for ${user.email}?`
      : `Re-enable login access for ${user.email}?`;

    if (!window.confirm(confirmText)) return;

    setActionInProgress('toggleDisable');
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'toggleDisable',
          targetUid: user.uid,
          disabled: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update user status');
      }

      const updatedUser = { ...user, disabled: nextStatus };

      // Local state update
      setUsers((prev) =>
        prev.map((u) => (u.uid === user.uid ? updatedUser : u))
      );
      if (selectedUser?.uid === user.uid) {
        setSelectedUser(updatedUser);
      }
      setStats((prev) =>
        prev
          ? {
              ...prev,
              activeUsers: nextStatus ? prev.activeUsers - 1 : prev.activeUsers + 1,
              disabledUsers: nextStatus ? prev.disabledUsers + 1 : prev.disabledUsers - 1,
            }
          : null
      );
      setActionSuccessMsg(data.message || `User is now ${nextStatus ? 'Suspended' : 'Active'}`);
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to toggle account suspension status');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeTokens = async (user: AdminUser) => {
    if (!currentUser) return;
    clearModalNotice();

    if (!window.confirm(`Revoke all active sessions for ${user.email}? The user will be immediately logged out on all devices.`)) {
      return;
    }

    setActionInProgress('revokeTokens');
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'revokeTokens',
          targetUid: user.uid,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke active user sessions');
      }

      setActionSuccessMsg(`All active device sessions revoked for ${user.email}.`);
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to revoke user sessions');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleGenerateResetLink = async (user: AdminUser) => {
    if (!currentUser) return;
    clearModalNotice();

    setActionInProgress('generateResetLink');
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'generateResetLink',
          targetUid: user.uid,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate password reset link');
      }

      setResetLink(data.resetLink);
      setActionSuccessMsg('Password reset link generated successfully!');
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to generate password reset link');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!currentUser) return;
    clearModalNotice();

    const confirmText = `DANGER: Are you sure you want to PERMANENTLY DELETE user ${user.email} (${user.uid})?\n\nThis cannot be undone!`;
    if (!window.confirm(confirmText)) return;

    setActionInProgress('deleteUser');
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'deleteUser',
          targetUid: user.uid,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete user account');
      }

      setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              totalUsers: prev.totalUsers - 1,
              activeUsers: user.disabled ? prev.activeUsers : prev.activeUsers - 1,
              disabledUsers: user.disabled ? prev.disabledUsers - 1 : prev.disabledUsers,
            }
          : null
      );
      setSelectedUser(null);
      alert(`User ${user.email} deleted successfully.`);
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to delete user account');
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Filtered Users List ─────────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (statusFilter === 'active') return matchesSearch && !u.disabled;
      if (statusFilter === 'disabled') return matchesSearch && u.disabled;
      return matchesSearch;
    });
  }, [users, searchQuery, statusFilter]);

  // ── Access Denied Screen ──────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="h-screen max-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-white text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-400 text-sm max-w-md mb-6">
          Admin privileges are restricted exclusively to <span className="text-cyan-400 font-mono">{ADMIN_EMAIL}</span>. Your current account ({currentUser?.email || 'Guest'}) does not have permission to view this console.
        </p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Safe Vault
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen bg-[#1a1a2e] flex flex-col animate-page overflow-hidden">
      {/* Top Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center justify-between px-4 py-3 h-14">
          <div className="flex items-center gap-3">
            {outletContext.setSidebarOpen ? (
              <button
                onClick={() => outletContext.setSidebarOpen?.(true)}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors md:hidden"
              >
                <AlignJustify className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <h1 className="text-white text-xl font-bold tracking-tight">Admin Console</h1>
            </div>
          </div>
          <button
            onClick={() => fetchAdminData(true)}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#16213e] hover:bg-white/10 text-cyan-400 transition-all active:scale-95 disabled:opacity-50"
            title="Refresh user data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-12">
        <div className="max-w-5xl mx-auto w-full space-y-5">
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#16213e] border border-white/5 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-white text-2xl font-black tabular-nums">
                {stats?.totalUsers ?? users.length}
              </span>
            </div>

            <div className="bg-[#16213e] border border-white/5 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Active</span>
                <UserCheck className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-green-400 text-2xl font-black tabular-nums">
                {stats?.activeUsers ?? users.filter((u) => !u.disabled).length}
              </span>
            </div>

            <div className="bg-[#16213e] border border-white/5 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Suspended</span>
                <UserX className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-red-400 text-2xl font-black tabular-nums">
                {stats?.disabledUsers ?? users.filter((u) => u.disabled).length}
              </span>
            </div>

            <div className="bg-[#16213e] border border-white/5 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Database Records</span>
                <Database className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-purple-400 text-2xl font-black tabular-nums">
                {stats?.totalProfiles ?? '-'}
              </span>
            </div>
          </div>

          {/* Error Notification */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between text-red-400 text-sm">
              <span>{error}</span>
              <button onClick={() => fetchAdminData(true)} className="underline font-semibold text-xs ml-2">
                Retry
              </button>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by email, name, or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#16213e] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                spellCheck="false"
              />
            </div>

            <div className="flex bg-[#16213e] border border-white/10 rounded-xl p-1 shrink-0">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'all' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                All ({users.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'active' ? 'bg-green-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('disabled')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'disabled' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Suspended
              </button>
            </div>
          </div>

          {/* Users List Container */}
          {loading ? (
            <div className="py-20 text-center text-gray-500">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-cyan-400 opacity-60" />
              <p className="text-sm">Fetching user records from Firebase Admin SDK...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-20 text-center text-gray-500 bg-[#16213e]/40 border border-white/5 rounded-2xl">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-white font-semibold">No users found</p>
              <p className="text-xs text-gray-500 mt-1">Try adjusting your search query or status filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => {
                const isAdmin = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                const initial = u.email ? u.email.charAt(0).toUpperCase() : 'U';

                return (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      clearModalNotice();
                      setResetLink(null);
                    }}
                    className={`group w-full text-left bg-[#16213e] border border-white/5 hover:border-cyan-500/40 hover:bg-[#1a294d] rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer shadow-sm active:scale-[0.98] ${
                      u.disabled ? 'opacity-70 bg-red-950/10 border-red-500/20' : ''
                    }`}
                  >
                    {/* User Profile Summary */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base shadow-md transition-transform group-hover:scale-105 ${
                          isAdmin
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-black'
                            : u.disabled
                            ? 'bg-red-900/40 text-red-400 border border-red-500/30'
                            : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                        }`}
                      >
                        {isAdmin ? <Crown className="w-5 h-5" /> : initial}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-base group-hover:text-cyan-300 transition-colors truncate">
                            {u.email}
                          </span>
                          {isAdmin && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                              Primary Admin
                            </span>
                          )}
                          {u.disabled && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider">
                              Suspended
                            </span>
                          )}
                          {u.emailVerified && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-gray-400 text-xs flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(u.uid, `list-uid-${u.uid}`);
                            }}
                            className="font-mono text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                            title="Click to copy UID"
                          >
                            {u.uid.slice(0, 12)}...
                            {copiedKey === `list-uid-${u.uid}` ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                          <span>•</span>
                          <span>Joined: {new Date(u.creationTime).toLocaleDateString()}</span>
                          {u.lastSignInTime && (
                            <>
                              <span>•</span>
                              <span>Active: {new Date(u.lastSignInTime).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* View Details Click Indicator */}
                    <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-cyan-400 transition-colors shrink-0">
                      <span className="hidden sm:inline font-medium text-xs">View details</span>
                      <ChevronRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── USER DETAILS & ACTIONS MODAL ──────────────────────────────────────────────── */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={() => {
            setSelectedUser(null);
            clearModalNotice();
            setResetLink(null);
          }}
        >
          <div
            className="bg-[#16213e] border border-white/10 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 relative my-auto max-h-[90vh] overflow-y-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4 gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-xl shadow-lg ${
                    selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-black'
                      : selectedUser.disabled
                      ? 'bg-red-900/40 text-red-400 border border-red-500/30'
                      : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                  }`}
                >
                  {selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? (
                    <Crown className="w-7 h-7" />
                  ) : (
                    selectedUser.email.charAt(0).toUpperCase()
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white text-xl font-bold truncate">{selectedUser.email}</h2>
                    {selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-black uppercase tracking-wider">
                        Primary Admin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedUser.disabled
                          ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                          : 'bg-green-500/10 text-green-400 border border-green-500/30'
                      }`}
                    >
                      {selectedUser.disabled ? 'Account Suspended' : 'Account Active'}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedUser.emailVerified
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                      }`}
                    >
                      {selectedUser.emailVerified ? 'Email Verified' : 'Email Not Verified'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedUser(null);
                  clearModalNotice();
                  setResetLink(null);
                }}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Feedback Notifications */}
            {actionSuccessMsg && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl p-3.5 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-green-400" />
                  <span>{actionSuccessMsg}</span>
                </div>
                <button onClick={clearModalNotice} className="text-gray-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {actionErrorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3.5 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{actionErrorMsg}</span>
                </div>
                <button onClick={clearModalNotice} className="text-gray-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Password Reset Link Output Banner */}
            {resetLink && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-cyan-400 text-xs font-bold uppercase tracking-wider">
                  <span>Generated Password Reset URL</span>
                  <span className="text-[10px] text-gray-400 font-normal">Valid for one-time use</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={resetLink}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(resetLink, 'modal-reset-link')}
                    className="px-3 py-2 rounded-lg bg-cyan-500 text-black font-semibold text-xs flex items-center gap-1 hover:bg-cyan-400 transition-colors shrink-0"
                  >
                    {copiedKey === 'modal-reset-link' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── SECTION 1: ALL COLLECTED USER INFORMATION ── */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" /> User Profile & Identity Information
              </h3>

              <div className="bg-[#10172a] border border-white/5 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Email Address */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" /> Email Address
                  </span>
                  <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                    <span className="text-white font-medium truncate select-all">{selectedUser.email}</span>
                    <button
                      onClick={() => copyToClipboard(selectedUser.email, 'modal-email')}
                      className="text-gray-400 hover:text-cyan-400 ml-2"
                      title="Copy Email"
                    >
                      {copiedKey === 'modal-email' ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Unique User ID (UID) */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Key className="w-3.5 h-3.5 text-purple-400" /> Firebase User ID (UID)
                  </span>
                  <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                    <span className="text-cyan-300 font-mono text-[11px] truncate select-all">{selectedUser.uid}</span>
                    <button
                      onClick={() => copyToClipboard(selectedUser.uid, 'modal-uid')}
                      className="text-gray-400 hover:text-cyan-400 ml-2"
                      title="Copy UID"
                    >
                      {copiedKey === 'modal-uid' ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Crown className="w-3.5 h-3.5 text-amber-400" /> Display Name
                  </span>
                  <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 text-gray-200">
                    {selectedUser.displayName || <span className="text-gray-500 italic">Not set</span>}
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Smartphone className="w-3.5 h-3.5 text-green-400" /> Phone Number
                  </span>
                  <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 text-gray-200">
                    {selectedUser.phoneNumber || <span className="text-gray-500 italic">None linked</span>}
                  </div>
                </div>

                {/* Creation Timestamp */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" /> Date Joined
                  </span>
                  <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 text-gray-200">
                    {selectedUser.creationTime
                      ? new Date(selectedUser.creationTime).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>

                {/* Last Sign In Timestamp */}
                <div className="space-y-1">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" /> Last Active Sign-In
                  </span>
                  <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 text-gray-200">
                    {selectedUser.lastSignInTime
                      ? new Date(selectedUser.lastSignInTime).toLocaleString()
                      : 'Never'}
                  </div>
                </div>

                {/* Auth Providers */}
                <div className="space-y-1 sm:col-span-2">
                  <span className="text-gray-400 flex items-center gap-1.5 text-[11px] uppercase font-semibold">
                    <Lock className="w-3.5 h-3.5 text-cyan-400" /> Authentication Provider Methods
                  </span>
                  <div className="flex items-center gap-2 flex-wrap bg-white/5 rounded-lg p-2.5 border border-white/5">
                    {selectedUser.providers && selectedUser.providers.length > 0 ? (
                      selectedUser.providers.map((p) => (
                        <span
                          key={p}
                          className="px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-mono font-medium"
                        >
                          {p === 'password' ? 'Email & Password' : p}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500 text-[11px] italic">Email & Password</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: STORED VAULT ARCHITECTURE & PRIVACY SUMMARY ── */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-400" /> Cloud Database & Storage Summary
              </h3>

              <div className="bg-[#10172a] border border-white/5 rounded-2xl p-4 text-xs space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Zero-Knowledge Encrypted Vault Payload</h4>
                    <p className="text-gray-400 text-[11px] mt-0.5 leading-relaxed">
                      Stored at <span className="text-cyan-400 font-mono">users/{selectedUser.uid}/data/vault</span>.
                      All passwords, credit cards, notes, and logins are encrypted client-side using Argon2id key derivation & AES-256-GCM. Plaintext credentials are NEVER accessible by servers or administrators.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                  <div>
                    <span className="text-gray-500">Settings Doc:</span>{' '}
                    <span className="text-gray-300 font-mono">users/{selectedUser.uid}/data/settings</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Device Sessions:</span>{' '}
                    <span className="text-gray-300 font-mono">users/{selectedUser.uid}/devices</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 3: ADMIN CONSOLE ACTIONS FOR THIS USER ── */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" /> Available Admin Console Actions
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* SUSPEND / ENABLE BUTTON (MOVED INSIDE USER CARD DETAILS) */}
                <button
                  onClick={() => handleToggleDisable(selectedUser)}
                  disabled={
                    actionInProgress === 'toggleDisable' ||
                    selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
                  }
                  className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 transition-all border ${
                    selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
                      ? 'bg-gray-800/40 text-gray-500 border-white/5 cursor-not-allowed'
                      : selectedUser.disabled
                      ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {actionInProgress === 'toggleDisable' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : selectedUser.disabled ? (
                      <Unlock className="w-4 h-4 text-green-400 shrink-0" />
                    ) : (
                      <Ban className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <div className="font-bold text-white">
                        {selectedUser.disabled ? 'Re-enable Account' : 'Suspend User Account'}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {selectedUser.disabled ? 'Grant login access back' : 'Block all Firebase Auth logins'}
                      </div>
                    </div>
                  </div>
                </button>

                {/* REVOKE ACTIVE SESSIONS */}
                <button
                  onClick={() => handleRevokeTokens(selectedUser)}
                  disabled={actionInProgress === 'revokeTokens'}
                  className="p-3.5 rounded-2xl bg-[#10172a] hover:bg-white/5 border border-white/10 text-xs font-semibold flex items-center justify-between gap-3 transition-all text-white"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {actionInProgress === 'revokeTokens' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : (
                      <LogOut className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <div className="font-bold text-white">Revoke All Sessions</div>
                      <div className="text-[10px] text-gray-400 truncate">Force logout on all devices</div>
                    </div>
                  </div>
                </button>

                {/* GENERATE PASSWORD RESET LINK */}
                <button
                  onClick={() => handleGenerateResetLink(selectedUser)}
                  disabled={actionInProgress === 'generateResetLink'}
                  className="p-3.5 rounded-2xl bg-[#10172a] hover:bg-white/5 border border-white/10 text-xs font-semibold flex items-center justify-between gap-3 transition-all text-white"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {actionInProgress === 'generateResetLink' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : (
                      <Key className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <div className="font-bold text-white">Password Reset URL</div>
                      <div className="text-[10px] text-gray-400 truncate">Create one-time recovery link</div>
                    </div>
                  </div>
                </button>

                {/* DELETE USER ACCOUNT */}
                <button
                  onClick={() => handleDeleteUser(selectedUser)}
                  disabled={
                    actionInProgress === 'deleteUser' ||
                    selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
                  }
                  className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 transition-all ${
                    selectedUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
                      ? 'bg-gray-800/40 text-gray-500 border-white/5 cursor-not-allowed'
                      : 'bg-red-950/20 hover:bg-red-950/40 border-red-500/40 text-red-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {actionInProgress === 'deleteUser' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <div className="font-bold text-red-400">Delete Account</div>
                      <div className="text-[10px] text-red-400/70 truncate">Permanently remove user</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  clearModalNotice();
                  setResetLink(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
