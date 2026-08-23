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
} from 'lucide-react';
import { getCurrentUser } from '@/app/auth';

const ADMIN_EMAIL = 'mohdjamal1110@gmail.com';

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  disabled: boolean;
  creationTime: string;
  lastSignInTime: string;
  providers: string[];
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

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
    } catch (err: any) {
      console.error('[Admin Dashboard Error]:', err);
      setError(err.message || 'Failed to connect to Admin API server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isAuthorized) {
      fetchAdminData();
    }
  }, [isAuthorized, fetchAdminData]);

  const handleToggleDisable = async (user: AdminUser) => {
    if (!currentUser) return;
    const nextStatus = !user.disabled;
    const confirmText = nextStatus
      ? `Are you sure you want to DISABLE login access for ${user.email}?`
      : `Re-enable login access for ${user.email}?`;

    if (!window.confirm(confirmText)) return;

    setActionInProgress(user.uid);
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

      // Local state update
      setUsers((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, disabled: nextStatus } : u))
      );
      setStats((prev) =>
        prev
          ? {
              ...prev,
              activeUsers: nextStatus ? prev.activeUsers - 1 : prev.activeUsers + 1,
              disabledUsers: nextStatus ? prev.disabledUsers + 1 : prev.disabledUsers - 1,
            }
          : null
      );
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUid(text);
    setTimeout(() => setCopiedUid(null), 2000);
  };

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
                <div
                  key={u.uid}
                  className={`bg-[#16213e] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-white/10 ${
                    u.disabled ? 'opacity-60 bg-red-950/10 border-red-500/20' : ''
                  }`}
                >
                  {/* User Profile Details */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base shadow-md ${
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
                        <span className="text-white font-semibold text-sm truncate">{u.email}</span>
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
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-gray-500 text-xs flex-wrap">
                        <button
                          onClick={() => copyToClipboard(u.uid)}
                          className="font-mono text-[11px] bg-white/5 hover:bg-white/10 text-gray-400 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                          title="Click to copy UID"
                        >
                          {u.uid.slice(0, 12)}...
                          {copiedUid === u.uid ? (
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

                  {/* Actions Toolbar */}
                  {!isAdmin && (
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleToggleDisable(u)}
                        disabled={actionInProgress === u.uid}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          u.disabled
                            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30'
                            : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                        }`}
                      >
                        {actionInProgress === u.uid ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : u.disabled ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" /> Enable Account
                          </>
                        ) : (
                          <>
                            <Ban className="w-3.5 h-3.5" /> Suspend
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
