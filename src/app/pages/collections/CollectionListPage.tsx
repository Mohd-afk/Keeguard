import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { Plus, ArrowLeft, Shield, Users, ArrowRight, FolderPlus, Loader2, Tag, Key, Share2, Check } from 'lucide-react';
import { type User } from 'firebase/auth';
import { subscribeToMyCollections, subscribeToSharedCollection, type SharedCollection } from '../../firestore/collections';
import { createCollection } from '../../api/collections';
import { getSessionCryptoKey } from '../../store';
import { ensureDeviceKeyPair, loadDevicePrivateKey, wrapCollectionKey, generateCollectionKey } from '../../crypto/collectionCrypto';
import { getSharedCollectionItems, isCollectionWaitingForKey, addSyncStoreListener, setCollectionKey } from '../../stores/syncStore';
import { toast } from 'sonner';

interface OutletContext {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function CollectionListPage() {
  const { user } = useOutletContext<OutletContext>();
  const navigate = useNavigate();

  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [collections, setCollections] = useState<Record<string, SharedCollection>>({});
  const [loading, setLoading] = useState(true);

  // Selection & Long press state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);

  const startPress = (cid: string) => {
    const timer = setTimeout(() => {
      setSelectedId(cid);
      toast.success('Folder selected', { duration: 1500 });
    }, 600);
    setPressTimer(timer);
  };

  const endPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Subscribe to collections list
  useEffect(() => {
    const unsubList = subscribeToMyCollections(user.uid, (ids) => {
      setCollectionIds(ids);
      setLoading(false);
    });

    return unsubList;
  }, [user.uid]);

  // Ensure device keys exist and publish public profile to userProfiles
  useEffect(() => {
    const checkAndPublishProfile = async () => {
      const vaultKey = getSessionCryptoKey();
      if (vaultKey && user) {
        try {
          const pubKeyB64 = await ensureDeviceKeyPair(vaultKey);
          const { getUsernameForUid, publishPublicProfile } = await import('../../firestore');
          const username = await getUsernameForUid(user.uid);
          if (username) {
            await publishPublicProfile(user.uid, username, user.displayName, pubKeyB64);
            console.log('[COLLECTIONS_PAGE] Public profile verified and published.');
          }
        } catch (err) {
          console.error('[COLLECTIONS_PAGE] Failed to verify/publish public profile:', err);
        }
      }
    };
    checkAndPublishProfile();
  }, [user]);

  // Subscribe to details of each collection
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    collectionIds.forEach((id) => {
      const unsub = subscribeToSharedCollection(id, (col) => {
        if (col) {
          setCollections((prev) => ({ ...prev, [id]: col }));
        }
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [collectionIds]);

  // Subscribe to syncStore updates to refresh item counts live
  useEffect(() => {
    const unsub = addSyncStoreListener(() => {
      setCollections((prev) => ({ ...prev }));
    });
    return unsub;
  }, []);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) {
      toast.error('Collection name is required');
      return;
    }

    setCreating(true);
    try {
      const vaultKey = getSessionCryptoKey();
      if (!vaultKey) {
        throw new Error('Vault is locked. Please unlock the vault to perform crypto operations.');
      }

      // 1. Generate new collection AES key
      const collectionKey = await generateCollectionKey();

      // 2. Ensure device keypair exists
      const pubKeyB64 = await ensureDeviceKeyPair(vaultKey);
      const privKey = await loadDevicePrivateKey(vaultKey);
      if (!privKey) {
        throw new Error('Could not load device private key');
      }

      // 3. Wrap collection key using our device keypair (Self-wrap)
      const wrappedKey = await wrapCollectionKey(collectionKey, privKey, pubKeyB64);

      // 4. Invoke Callable Function to create collection
      const newCid = await createCollection({
        name: newColName.trim(),
        description: newColDesc.trim() || undefined,
        ownerEnvelope: {
          wrappedKey,
          senderPublicKeyB64: pubKeyB64,
        },
      });

      // 5. Pre-register key in syncStore so detail page is instantly unlocked
      setCollectionKey(newCid, collectionKey);

      toast.success(`Shared Collection "${newColName}" created!`);
      setShowCreateModal(false);
      setNewColName('');
      setNewColDesc('');
      
      // Navigate to the newly created collection detail
      navigate(`/collections/${newCid}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            aria-label="Back to safe"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white text-lg font-bold">Shared Vaults</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/share')}
            className="p-2 bg-white/5 text-gray-300 hover:bg-white/10 rounded-xl transition-all border border-white/10 active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          >
            <Share2 className="w-4 h-4" />
            Share Folder
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/20 active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            New Blank
          </button>
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : collectionIds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-5 pt-16">
            <div className="w-16 h-16 rounded-full bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center text-cyan-400 animate-pulse">
              <Shield className="w-8 h-8" />
            </div>
            <div className="max-w-[260px] space-y-2">
              <h3 className="text-white font-bold text-base">Shared Collections</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Create a blank shared folder, or share an existing personal folder securely with zero-knowledge encryption.
              </p>
            </div>
            <div className="flex flex-col w-full gap-3 mt-2 max-w-[240px]">
              <button
                onClick={() => navigate('/share')}
                className="py-2.5 px-5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 border border-cyan-400/20"
              >
                <Share2 className="w-4 h-4" />
                Share Existing Folder
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="py-2.5 px-5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-xl transition-all active:scale-98 flex items-center justify-center gap-2 border border-white/10"
              >
                <Plus className="w-4 h-4" />
                Create Blank Vault
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {collectionIds.map((cid) => {
              const col = collections[cid];
              if (!col) return null;

              const itemsCount = getSharedCollectionItems(cid).length;
              const isWaiting = isCollectionWaitingForKey(cid);
              const isSelected = selectedId === cid;

              const handleItemClick = (e: React.MouseEvent) => {
                if (selectedId) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedId(isSelected ? null : cid);
                } else {
                  navigate(`/collections/${cid}`);
                }
              };

              const handleCheckboxClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedId(isSelected ? null : cid);
              };

              return (
                <button
                  key={cid}
                  onClick={handleItemClick}
                  onMouseDown={() => startPress(cid)}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onTouchStart={() => startPress(cid)}
                  onTouchEnd={endPress}
                  className={`w-full flex items-center justify-between p-4 bg-[#16213e] hover:bg-[#16213e]/70 border rounded-2xl text-left transition-all active:scale-[0.98] group ${
                    isSelected
                      ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)] bg-cyan-500/5'
                      : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                    {/* Checkbox circle selector */}
                    <div
                      onClick={handleCheckboxClick}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500 text-white'
                          : 'border-white/20 group-hover:border-cyan-500/50 bg-black/20'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20 group-hover:bg-cyan-500/15 transition-all">
                      <Shield className="w-5 h-5" />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white text-sm font-bold truncate group-hover:text-cyan-400 transition-colors">
                          {col.name}
                        </h3>
                        {isWaiting && (
                          <span className="bg-amber-500/10 text-amber-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
                            WAITING KEY
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-500 text-xs truncate mt-0.5 leading-normal">
                        {col.description || 'Zero-Knowledge Shared Folder'}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Key className="w-3 h-3 text-cyan-400" />
                          {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                        </span>
                        <span>•</span>
                        <span className="bg-white/5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-semibold">
                          r{col.current_revision}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !creating && setShowCreateModal(false)} />

          {/* Form */}
          <form
            onSubmit={handleCreateCollection}
            className="relative w-full bg-[#16213e] border-t border-white/10 rounded-t-3xl p-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
          >
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto -mt-2.5 mb-1 opacity-45" />

            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <h2 className="text-white font-bold text-base">New Shared Collection</h2>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Collection Name</label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. Work Logins, Family Vault"
                  maxLength={50}
                  className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2.5 px-3.5 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Description (Optional)</label>
                <textarea
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  placeholder="Summarize the items stored in this collection..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2.5 px-3.5 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all resize-none"
                />
              </div>

              <div className="flex items-start gap-2 bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3 text-cyan-400 text-[10px] leading-relaxed">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Secure Vault Key Domain:</strong> Creating this folder generates an isolated, independent cryptographic key domain. All members added in the future will have their keys wrapped locally by your device.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-3 mt-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating cryptographic keys...
                </>
              ) : (
                'Create Collection'
              )}
            </button>
          </form>
        </div>
      )}
      {/* Floating Contextual Action Bar */}
      {selectedId && (
        <div className="fixed bottom-6 left-4 right-4 z-40 bg-[#16213e]/85 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-between animate-in slide-in-from-bottom duration-300">
          <div className="min-w-0 flex-1 pr-3">
            <h3 className="text-white text-xs font-bold truncate">
              {collections[selectedId]?.name || 'Selected Folder'}
            </h3>
            <p className="text-cyan-400 text-[10px] font-semibold mt-0.5">
              1 Folder Selected
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedId(null)}
              className="px-3.5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const name = encodeURIComponent(collections[selectedId]?.name || 'Shared Vault');
                navigate(`/share?collectionId=${selectedId}&name=${name}`);
              }}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 flex items-center gap-1.5 border border-cyan-400/20"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline replacement for missing X component
function X(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
