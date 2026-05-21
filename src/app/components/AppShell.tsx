import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { LockScreen } from './LockScreen';
import { AuthScreen } from './AuthScreen';
import { getSettings, clearSession, clearLocalVaultData, getVaultItems, permanentlyDeleteVaultItem, addVaultChangeListener, subscribeToCustomCategories, type CustomCategory, type VaultItem } from '../store';
import { onAuthChange, signOut, isVerificationLink } from '../auth';
import { getFirebaseAuth } from '../firebase';
import type { User } from 'firebase/auth';
import { createLogger } from '../utils/logger';
import { registerCurrentDevice, listenForRevocation, updateLastActive } from '../services/deviceSession';
import { saveUserEmailToProfile } from '../firestore';
import { Sidebar, type SidebarFilter } from './Sidebar';

const log = createLogger('UI');

export function AppShell() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [magicLinkActive, setMagicLinkActive] = useState(false);

  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);

  useEffect(() => {
    if (unlocked) {
      setItems(getVaultItems());
      const unsub = addVaultChangeListener((updated) => setItems([...updated]));
      const unsubCats = subscribeToCustomCategories((categories) => setCustomCategories(categories));
      return () => {
        unsub();
        unsubCats();
      };
    }
  }, [unlocked]);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether we've received ANY auth event yet during this boot.
  // Firebase emits null first on cold boot while it restores from IndexedDB.
  // We must NOT clearSession on that first null — it's not a sign-out.
  const isInitialAuthEvent = useRef(true);
  // Mirror of 'user' state accessible inside the stable auth listener closure
  // without causing the listener to re-subscribe on every user change.
  const userRef = useRef<User | null>(null);

  // Check on mount if we're entering via a magic link
  useEffect(() => {
    if (isVerificationLink(window.location.href)) {
      log.info('AppShell: Magic link detected on mount');
      setMagicLinkActive(true);
    }
  }, []);

  // ── Auth state listener ────────────────────────────────────────────
  // IMPORTANT: dependency array is [] — this must only subscribe ONCE.
  //
  // Previously this used [user] as a dependency, which caused the listener
  // to unsubscribe and re-subscribe on every auth state change. Firebase only
  // emits its initial IndexedDB-restored auth event once. When the listener was
  // torn down and recreated after that event, the new listener waited forever
  // for an event that had already fired — leaving authLoading=true permanently
  // and freezing the "Loading Keeguard..." spinner after an OTA bundle swap.
  //
  // Fix: subscribe once. Use userRef (a ref mirror of the user state) to safely
  // read the current user inside the stable closure without stale captures.
  useEffect(() => {
    // ── Safety valve: guarantee authLoading clears within 5s ──────────
    // If Firebase never calls back (e.g. network down, IndexedDB corruption,
    // or auth not yet initialized), this timer ensures the app becomes usable.
    const safetyTimer = setTimeout(() => {
      log.warn('AppShell: Auth safety timeout fired — forcing authLoading=false to unblock UI');
      setAuthLoading(false);
    }, 5000);

    const unsubscribe = onAuthChange((firebaseUser) => {
      clearTimeout(safetyTimer); // Auth responded — cancel the safety timer

      const wasInitial = isInitialAuthEvent.current;
      isInitialAuthEvent.current = false;

      log.info('AppShell: Auth state change', {
        uid: firebaseUser?.uid ?? null,
        isInitialEvent: wasInitial,
      });

      // Use userRef to compare previous user without stale closure capture.
      // If switching to a DIFFERENT user, clear stale local data.
      const prevUser = userRef.current;
      if (firebaseUser && prevUser && firebaseUser.uid !== prevUser.uid) {
        log.info('AppShell: User switched, clearing stale data', { oldUid: prevUser.uid, newUid: firebaseUser.uid });
        clearLocalVaultData().catch(console.error);
        clearSession();
      }

      userRef.current = firebaseUser;
      setUser(firebaseUser);
      setAuthLoading(false);

      // Only clearSession on a CONFIRMED sign-out (not the initial cold-boot null).
      // On cold boot, Firebase emits null while still reading from IndexedDB.
      // Clearing session during that window would destroy valid vault state.
      if (!firebaseUser && !wasInitial) {
        log.info('AppShell: Confirmed sign-out — clearing session');
        setUnlocked(false);
        clearSession();
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []); // ← MUST stay empty. See comment above.

  const handleLock = useCallback(() => {
    log.info('AppShell: Vault locked');
    clearSession();
    setUnlocked(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    log.info('AppShell: Signing out');
    // If we were processing a magic link but decided to sign out
    setMagicLinkActive(false);
    clearSession();
    clearLocalVaultData().catch(console.error);
    setUnlocked(false);
    try {
      await signOut();
      log.info('AppShell: Sign-out complete');
    } catch (e) {
      log.error('AppShell: Sign-out error (ignored)', e);
    }
  }, []);

  // ── Auto-delete expired trash items ────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;
    const items = getVaultItems();
    const now = new Date().getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    items.forEach(item => {
      if (item.deletedAt) {
        const deletedTime = new Date(item.deletedAt).getTime();
        if (now - deletedTime > thirtyDaysMs) {
          permanentlyDeleteVaultItem(item.id).catch(console.error);
        }
      }
    });
  }, [unlocked]);

  // ── Auto-lock on inactivity ──────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    let cancelled = false;

    getSettings().then((settings) => {
      if (cancelled || settings.autoLockTimeout === 0) return;

      const timeoutMs = settings.autoLockTimeout * 60 * 1000;

      const resetTimer = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        inactivityTimer.current = setTimeout(handleLock, timeoutMs);
      };

      const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
      events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
      resetTimer();

      // Store cleanup for this specific invocation
      cleanupRef.current = () => {
        events.forEach((e) => window.removeEventListener(e, resetTimer));
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      };
    });

    const cleanupRef = { current: null as (() => void) | null };

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [unlocked, handleLock]);

  // ── Auto-lock on tab hide ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    let cancelled = false;

    getSettings().then((settings) => {
      if (cancelled || !settings.lockOnHide) return;

      const handleVisibility = () => {
        if (document.hidden) {
          visibilityTimer.current = setTimeout(handleLock, 30_000);
        } else {
          if (visibilityTimer.current) {
            clearTimeout(visibilityTimer.current);
            visibilityTimer.current = null;
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      cleanupRef.current = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (visibilityTimer.current) clearTimeout(visibilityTimer.current);
      };
    });

    const cleanupRef = { current: null as (() => void) | null };

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [unlocked, handleLock]);

  // ── Device Session tracking ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || !user) return;

    let cleanupListener: (() => void) | undefined;
    let cancelled = false;

    // Register device and sync location
    registerCurrentDevice(user.uid).then(() => {
      if (cancelled) return;
      // Start listening for revocation after registration
      cleanupListener = listenForRevocation(user.uid, () => {
        log.warn('AppShell: Session revoked remotely. Signing out.');
        handleSignOut();
      });
    }).catch(e => log.error('AppShell: Failed to register device', e));

    if (user.email) {
      saveUserEmailToProfile(user.uid, user.email).catch(e => log.error('AppShell: Failed to save email to profile', e));
    }

    // Update lastActive on user interactions, throttled internally to 10 min
    const handleInteraction = () => {
      updateLastActive(user.uid).catch(e => log.error('AppShell: Failed heartbeat', e));
    };

    const interactionEvents = ['mousedown', 'keydown', 'touchstart'];
    interactionEvents.forEach(e => document.addEventListener(e, handleInteraction, { passive: true }));
    
    // Also run an interval just in case they are reading passively
    const tenMins = 10 * 60 * 1000;
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleInteraction();
      }
    }, tenMins);

    return () => {
      cancelled = true;
      if (cleanupListener) cleanupListener();
      clearInterval(heartbeatInterval);
      interactionEvents.forEach(e => document.removeEventListener(e, handleInteraction));
    };
  }, [unlocked, user, handleSignOut]);

  // ── Loading state ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading Keeguard...</p>
        </div>
      </div>
    );
  }

  // ── Gate 1: Auth & Magic Links ───────────────────────────────────
  // If no user, OR we are actively processing a magic link setup
  if (!user || magicLinkActive) {
    return <AuthScreen onAuthenticated={() => {
      // Completed account authentication
      setMagicLinkActive(false);
      setUser(getFirebaseAuth().currentUser);
      // Force all users to LockScreen to manage their vault state
      setUnlocked(false);
    }} />;
  }

  // ── Gate 2: Lock ─────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => setUnlocked(true)}
        userEmail={user.email ?? undefined}
        onSignOut={handleSignOut}
      />
    );
  }

  // ── Unlocked vault ───────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#1a1a2e] relative shadow-2xl">
      <Outlet context={{ onLock: handleLock, onSignOut: handleSignOut, user, sidebarOpen, setSidebarOpen, sidebarFilter, setSidebarFilter }} />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeFilter={sidebarFilter}
        onFilterChange={(f) => {
          setSidebarFilter(f);
          navigate('/');
        }}
        items={items}
        customCategories={customCategories}
        onNavigateSettings={() => {
          setSidebarOpen(false);
          navigate('/settings');
        }}
      />
    </div>
  );
}
