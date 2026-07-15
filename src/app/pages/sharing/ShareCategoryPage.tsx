// ─── Share Category / Collection Page ────────────────────────────────────────
// Dedicated sharing flow page. Reached via /share?collectionId={id}&name={name}
// Reuses existing InviteByUsernameInput (debounced), RoleSelect, and sendInvite.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router';
import {
  ArrowLeft,
  Share2,
  UserPlus,
  Users,
  Send,
  X,
  Loader2,
  FolderHeart,
  Check,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import { InviteByUsernameInput } from '../../components/collections/InviteByUsernameInput';
import { RoleSelect } from '../../components/collections/RoleSelect';
import {
  setActiveCollectionId,
  getActiveCollectionMembers,
  addAccessChangeListener,
  sendInvite,
} from '../../stores/accessStore';
import { type CollectionMember } from '../../firestore/collections';
import { type UserSearchResult, getConnections } from '../../api/users';
import { toast } from 'sonner';

interface OutletContext {
  user: User;
  onLock: () => void;
  onSignOut: () => void;
}

export function ShareCategoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useOutletContext<OutletContext>();

  // Folder selection state (GDrive style wizard)
  const initialFolderId = searchParams.get('collectionId');
  const initialFolderName = searchParams.get('name');
  
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string; type: 'category' | 'collection' } | null>(
    initialFolderId ? { id: initialFolderId, name: initialFolderName || 'Shared Vault', type: 'collection' } : null
  );

  // Invite form state
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedRole, setSelectedRole] = useState<'manager' | 'editor' | 'viewer'>('editor');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showPermissionSheet, setShowPermissionSheet] = useState(false);

  // Members state for the "Recent Connections" section
  const [members, setMembers] = useState<CollectionMember[]>([]);

  // Connections state
  const [connections, setConnections] = useState<UserSearchResult[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Categories & Vault Items state
  const [customCategories, setCustomCategories] = useState<any[]>([]);
  const [vaultItems, setVaultItems] = useState<any[]>([]);

  useEffect(() => {
    import('../../store').then((m) => {
      m.subscribeToCustomCategories(setCustomCategories);
      m.subscribe(setVaultItems);
    });
  }, []);

  // Fetch connections
  useEffect(() => {
    async function loadConnections() {
      try {
        const list = await getConnections();
        setConnections(list);
      } catch (err) {
        console.error('Failed to load connections:', err);
      } finally {
        setLoadingConnections(false);
      }
    }
    loadConnections();
  }, []);

  // Subscribe to collection members for "Connections" section
  useEffect(() => {
    if (!selectedFolder || selectedFolder.type !== 'collection') return;

    setActiveCollectionId(selectedFolder.id);
    const unsub = addAccessChangeListener(() => {
      setMembers(getActiveCollectionMembers());
    });

    return () => {
      setActiveCollectionId(null);
      unsub();
    };
  }, [selectedFolder]);

  // When a user is selected from search, open the permission sheet
  const handleUserSelect = (u: UserSearchResult | null) => {
    setSelectedUser(u);
    if (u) {
      setShowPermissionSheet(true);
    } else {
      setShowPermissionSheet(false);
    }
  };

  const handleSendInvite = async () => {
    if (!selectedUser) {
      toast.error('Please select a user to invite');
      return;
    }
    if (!selectedFolder) {
      toast.error('No folder selected. Please go back and try again.');
      return;
    }

    const targetUser = selectedUser;
    setInviting(true);
    // Optimistic UI: close immediately
    setShowPermissionSheet(false);
    setSelectedUser(null);
    setInviteMessage('');

    toast.success(`Share sequence started for @${targetUser.username}`, {
      description: `Migrating folder and securing keys...`,
      duration: 3000,
    });

    try {
      // 1. Fetch recipient's public key from Firestore userProfiles
      const { doc, getDoc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      const profileSnap = await getDoc(doc(db, 'userProfiles', targetUser.uid));
      if (!profileSnap.exists()) {
        throw new Error('User has not established public keys. They must login to the updated app version before being invited.');
      }
      
      const recipientPubKeyB64 = profileSnap.data()!.public_key;
      if (!recipientPubKeyB64) {
        throw new Error('Recipient has no public ECDH key registered.');
      }

      // 2. Load device private key to sign/derive ECDH secret
      const { getSessionCryptoKey } = await import('../../store');
      const { loadDevicePrivateKey, wrapCollectionKey, getDevicePublicKeyB64, generateCollectionKey, ensureDeviceKeyPair } = await import('../../crypto/collectionCrypto');
      const vaultKey = getSessionCryptoKey();
      if (!vaultKey) throw new Error('Vault session is locked.');
      
      let finalCollectionId = selectedFolder.id;
      let collectionKey: CryptoKey;

      if (selectedFolder.type === 'category') {
          // Migration flow!
          collectionKey = await generateCollectionKey();
          const myPubKeyB64 = await ensureDeviceKeyPair(vaultKey);
          const privKey = await loadDevicePrivateKey(vaultKey);
          if (!privKey) throw new Error('Could not load device private key');
          const selfWrappedKey = await wrapCollectionKey(collectionKey, privKey, myPubKeyB64);
          
          const itemsToMigrate = vaultItems
            .filter((i: any) => !i.deletedAt && (i.categoryId === selectedFolder.id || (i.type || 'login').toLowerCase() === selectedFolder.id.toLowerCase()))
            .map((i: any) => ({
              id: i.id,
              title: i.title || 'Untitled Item',
              plaintext: i.password || '',
              itemType: ((i.type || 'login').toLowerCase() as any)
            }));

          const { migrateCategoryToCollection } = await import('../../api/collections');
          finalCollectionId = await migrateCategoryToCollection(
             selectedFolder.id, 
             selectedFolder.name, 
             { wrappedKey: selfWrappedKey, senderPublicKeyB64: myPubKeyB64 },
             itemsToMigrate,
             collectionKey
          );
          
          const { setCollectionKey } = await import('../../stores/syncStore');
          setCollectionKey(finalCollectionId, collectionKey);
          
          toast.success(`Folder "${selectedFolder.name}" shared with ${itemsToMigrate.length} password(s)!`);
      } else {
          // Normal flow — get key from syncStore cache
          const { getCollectionKey } = await import('../../stores/syncStore');
          let key = getCollectionKey(finalCollectionId);
          if (!key) {
            // Key not in cache yet (sync listener hasn't fired) — fetch envelope from Firestore
            const { getCollectionKeyEnvelope } = await import('../../firestore/collections');
            const { unwrapCollectionKey } = await import('../../crypto/collectionCrypto');
            const user = (await import('firebase/auth')).getAuth().currentUser;
            if (!user) throw new Error('Not authenticated');
            const privKey2 = await loadDevicePrivateKey(vaultKey);
            if (!privKey2) throw new Error('Device private key not available');
            const envelope = await getCollectionKeyEnvelope(finalCollectionId, user.uid);
            if (!envelope) throw new Error('No key envelope found for this collection. Please re-open the vault.');
            key = await unwrapCollectionKey(
              envelope.wrapped_collection_key,
              privKey2,
              envelope.sender_public_key_b64,
              finalCollectionId,
              envelope.collection_key_version,
            );
            // Cache it for subsequent operations
            const { setCollectionKey } = await import('../../stores/syncStore');
            setCollectionKey(finalCollectionId, key);
          }
          collectionKey = key;
      }

      const privKey = await loadDevicePrivateKey(vaultKey);
      if (!privKey) throw new Error('Failed to load local device signing private key.');
      
      // 4. Wrap CollectionKey for recipient using recipient's public key
      const wrappedKey = await wrapCollectionKey(collectionKey, privKey, recipientPubKeyB64);
      const myPubKeyB64 = await getDevicePublicKeyB64();
      if (!myPubKeyB64) throw new Error('Failed to retrieve local device public key.');

      // 5. Send invite along with recipient's envelope!
      await sendInvite(
        targetUser.username,
        selectedRole,
        inviteMessage.trim() || undefined,
        {
          wrappedKey,
          senderPublicKeyB64: myPubKeyB64,
        },
        finalCollectionId  // Explicit collection ID — needed for freshly-migrated collections
      );
      
      toast.success(`Invite sent to @${targetUser.username}!`);
      
      // If we just migrated it, update the URL so we stay on the collection page
      if (selectedFolder.type === 'category') {
         setSelectedFolder({ id: finalCollectionId, name: selectedFolder.name, type: 'collection' });
      }
    } catch (err: any) {
      console.error('Failed to send invite:', err);
      toast.error(`Failed to send invite: ${err.message || 'Unknown error'}`, {
        description: 'Please try again.',
        duration: 5000,
      });
    } finally {
      setInviting(false);
    }
  };

  // Active members excluding self — shown as "Recent Connections"
  const otherMembers = members.filter((m) => m.user_id !== user.uid && m.status === 'active');

  if (!selectedFolder) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex flex-col animate-page select-none">
        <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)] px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold text-lg">Select Folder to Share</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
         {(() => {
             const folders = [
               ...customCategories.map((cat: any) => ({
                 id: cat.id,
                 name: cat.name,
                 subtitle: 'Custom Folder',
                 count: vaultItems.filter((i: any) => !i.deletedAt && i.categoryId === cat.id).length
               })),
               {
                 id: 'login',
                 name: 'Logins',
                 subtitle: 'Built-in Folder',
                 count: vaultItems.filter((i: any) => !i.deletedAt && !i.categoryId && (i.type || 'login').toLowerCase() === 'login').length
               },
               {
                 id: 'card',
                 name: 'Cards',
                 subtitle: 'Built-in Folder',
                 count: vaultItems.filter((i: any) => !i.deletedAt && !i.categoryId && (i.type || '').toLowerCase() === 'card').length
               },
               {
                 id: 'note',
                 name: 'Secure Notes',
                 subtitle: 'Built-in Folder',
                 count: vaultItems.filter((i: any) => !i.deletedAt && !i.categoryId && (i.type || '').toLowerCase() === 'note').length
               }
             ];

             return folders.map((folder) => (
               <button
                 key={folder.id}
                 onClick={() => setSelectedFolder({ id: folder.id, name: folder.name, type: 'category' })}
                 className="w-full flex items-center justify-between p-4 bg-[#16213e] hover:bg-[#16213e]/80 border border-white/5 hover:border-cyan-500/50 rounded-2xl text-left transition-all active:scale-[0.98] group"
               >
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-colors">
                     <FolderHeart className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="text-white text-sm font-bold group-hover:text-cyan-400 transition-colors">{folder.name}</h3>
                     <p className="text-gray-500 text-[10px] mt-0.5">{folder.subtitle}</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                     {folder.count} password{folder.count === 1 ? '' : 's'} saved
                   </span>
                   <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                 </div>
               </button>
             ));
           })()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col animate-page select-none">

      {/* Sticky Header with Search */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3 h-14">
          <button
            onClick={() => {
                if (!initialFolderId) setSelectedFolder(null); // Go back to folder select
                else navigate(-1);
            }}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-sm truncate">Share Vault</h1>
              <p className="text-gray-500 text-[10px] truncate leading-none mt-0.5">{selectedFolder.name}</p>
            </div>
          </div>
        </div>
        
        {/* Sticky Search bar container right under navigation header */}
        <div className="px-5 pb-3 bg-[#1a1a2e]">
          <InviteByUsernameInput
            onSelectUser={handleUserSelect}
            selectedUser={selectedUser}
          />
        </div>
      </div>

      {/* Scroll Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_96px)] space-y-6">

        {/* Collection Banner */}
        <div className="flex items-center gap-3 p-4 bg-[#16213e] border border-white/5 rounded-2xl">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400">
            <FolderHeart className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-sm truncate">{selectedFolder.name}</p>
            <p className="text-gray-500 text-[10px] mt-0.5 leading-none">
              Secure zero-knowledge shared folder
            </p>
          </div>
          <button
            onClick={() => {
                if (selectedFolder.type === 'collection') navigate(`/collections/${selectedFolder.id}`);
            }}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
            title="View vault"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Connections & Recent Interactions List */}
        <div className="space-y-2">
          <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest pl-0.5">
            Connections & Recent Interactions
          </p>
          
          {loadingConnections ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : connections.length === 0 ? (
            <div className="p-4 text-center rounded-2xl bg-[#16213e] border border-white/5 text-gray-500 text-xs">
              No recent connections found. Search a user to share!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {connections.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => handleUserSelect(c)}
                  className="w-full flex items-center justify-between p-3.5 bg-[#16213e] hover:bg-[#16213e]/70 border border-white/5 rounded-2xl text-left transition-all active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 text-sm font-bold uppercase transition-all group-hover:bg-cyan-500/15">
                      {(c.displayName || c.username || 'U')[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-bold truncate group-hover:text-cyan-400 transition-colors">
                        {c.displayName || c.username}
                      </p>
                      <p className="text-gray-500 text-[10px] truncate mt-0.5 leading-none">
                        @{c.username}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Connections / Members */}
        {otherMembers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 pl-0.5">
              <Users className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest">
                Current Members ({otherMembers.length})
              </p>
            </div>
            <div className="space-y-2">
              {otherMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-3.5 bg-[#16213e] border border-white/5 rounded-2xl"
                >
                  {/* Avatar placeholder */}
                  <div className="w-9 h-9 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 text-sm font-bold uppercase">
                    {(m.display_name || m.username || 'U')[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-semibold truncate">
                      {m.display_name || m.username || 'Member'}
                    </p>
                    {m.username && (
                      <p className="text-gray-500 text-[10px] truncate mt-0.5">
                        @{m.username}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                      m.role === 'owner'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : m.role === 'manager'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : m.role === 'editor'
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {m.role === 'editor' ? 'Collaborator' : m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Permission Bottom Sheet */}
      {showPermissionSheet && selectedUser && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setShowPermissionSheet(false);
              setSelectedUser(null);
            }}
          />

          {/* Sheet */}
          <div className="relative w-full bg-[#16213e] border-t border-white/10 rounded-t-3xl p-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-5 shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto -mt-2.5 mb-1 opacity-45" />

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* User avatar */}
                <div className="w-10 h-10 rounded-full bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400 text-sm font-bold uppercase">
                  {(selectedUser.displayName || selectedUser.username)[0]}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">
                    {selectedUser.displayName || selectedUser.username}
                  </p>
                  <p className="text-gray-400 text-xs">@{selectedUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPermissionSheet(false);
                  setSelectedUser(null);
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role selection — viewer = Viewer, editor = Collaborator, manager = Manager */}
            <RoleSelect
              value={selectedRole}
              onChange={(r) => setSelectedRole(r)}
            />

            {/* Optional message input */}
            <div>
              <label className="text-gray-400 text-xs font-semibold mb-1.5 block">
                Message (Optional)
              </label>
              <input
                type="text"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a quick note for the recipient..."
                maxLength={100}
                className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2.5 px-3.5 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all placeholder-gray-600"
              />
            </div>

            {/* ZK Cryptographic Trust Indicator */}
            <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 text-emerald-400 text-[10px] leading-relaxed">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <strong>Zero-Knowledge Trust Model:</strong> Sharing keys are generated and wrapped locally on your device. The recipient's public key is verified, and neither our servers nor anyone else has access to the vault keys.
              </p>
            </div>

            {/* Send Request button */}
            <button
              type="button"
              disabled={inviting}
              onClick={handleSendInvite}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
            >
              {inviting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Request
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success state toast indicator (invisible — toast handles it) */}
    </div>
  );
}
