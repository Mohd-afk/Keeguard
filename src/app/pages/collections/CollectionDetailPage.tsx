import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router';
import {
  ArrowLeft,
  Shield,
  Users,
  Plus,
  Loader2,
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  Lock,
  Globe,
  CreditCard,
  FileText,
  Save,
  X,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  getSharedCollectionItems,
  isCollectionWaitingForKey,
  commitSharedItem,
  deleteSharedItem,
  addSyncStoreListener,
  type DecryptedCollectionItemExtended
} from '../../stores/syncStore';
import { getSharedCollection, subscribeToSharedCollection, subscribeToCollectionMembers, type SharedCollection } from '../../firestore/collections';
import { toast } from 'sonner';

interface OutletContext {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
  setNotificationDrawerOpen: (o: boolean) => void;
}

export function CollectionDetailPage() {
  const { id: collectionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, setNotificationDrawerOpen } = useOutletContext<OutletContext>();

  const [collection, setCollection] = useState<SharedCollection | null>(null);
  const [items, setItems] = useState<DecryptedCollectionItemExtended[]>([]);
  const [isWaitingKey, setIsWaitingKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'owner' | 'manager' | 'editor' | 'viewer'>('editor');

  // Modal / Form state for Add/Edit Form Sheet
  const [showFormSheet, setShowFormSheet] = useState(false);
  const [editingItem, setEditingItem] = useState<DecryptedCollectionItemExtended | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPlaintext, setFormPlaintext] = useState('');
  const [formType, setFormType] = useState<'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other'>('login');
  const [formLoading, setFormLoading] = useState(false);

  // Item details expansion state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // 1. Subscribe to Collection metadata
  useEffect(() => {
    if (!collectionId) return;

    const unsub = subscribeToSharedCollection(collectionId, (col) => {
      setCollection(col);
      setLoading(false);
    });

    const unsubMembers = subscribeToCollectionMembers(collectionId, (members) => {
      if (!user) return;
      const me = members.find((m) => m.user_id === user.uid);
      if (me) {
        setMyRole(me.role as any);
      }
    });

    return () => {
      unsub();
      unsubMembers();
    };
  }, [collectionId, user]);

  // 2. Subscribe to items and waiting key state from syncStore
  useEffect(() => {
    if (!collectionId) return;

    const updateState = () => {
      setItems(getSharedCollectionItems(collectionId));
      setIsWaitingKey(isCollectionWaitingForKey(collectionId));
    };

    updateState();
    const unsub = addSyncStoreListener(updateState);
    return unsub;
  }, [collectionId]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const togglePasswordReveal = (itemId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleOpenAddForm = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormPlaintext('');
    setFormType('login');
    setShowFormSheet(true);
  };

  const handleOpenEditForm = (item: DecryptedCollectionItemExtended) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormPlaintext(item.plaintext);
    setFormType(item.itemType as any);
    setShowFormSheet(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionId) return;
    if (!formTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!formPlaintext.trim()) {
      toast.error('Secret payload is required');
      return;
    }

    setFormLoading(true);
    try {
      const itemId = editingItem ? editingItem.id : crypto.randomUUID();
      const baseRev = editingItem ? editingItem.latestRevision : 0;

      const result = await commitSharedItem(
        collectionId,
        itemId,
        formTitle.trim(),
        formPlaintext.trim(),
        formType,
        baseRev
      );

      if (result.success) {
        toast.success(editingItem ? 'Item updated successfully!' : 'Item added successfully!');
        setShowFormSheet(false);
      } else if (result.conflict) {
        toast.error('Conflict detected. A resolution screen will handle this.');
        setShowFormSheet(false);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save item');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteItem = async (item: DecryptedCollectionItemExtended) => {
    if (!collectionId) return;
    const confirm = window.confirm(`Are you sure you want to delete "${item.title}"?`);
    if (!confirm) return;

    try {
      await deleteSharedItem(collectionId, item.id, item.latestRevision);
      toast.success(`"${item.title}" soft deleted`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'login':
        return <Globe className="w-5 h-5 text-cyan-400" />;
      case 'card':
        return <CreditCard className="w-5 h-5 text-pink-400" />;
      case 'note':
        return <FileText className="w-5 h-5 text-amber-400" />;
      default:
        return <Key className="w-5 h-5 text-gray-400" />;
    }
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
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-white font-bold text-lg">Shared Vault Not Found</h2>
        <p className="text-gray-500 text-xs mt-2 max-w-[280px]">
          The collection you are trying to view does not exist or you lack appropriate access permissions.
        </p>
        <button
          onClick={() => navigate('/collections')}
          className="mt-6 py-2 px-5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white text-xs font-bold transition-all"
        >
          Back to Collections
        </button>
      </div>
    );
  }

  // Waiting key envelope screen
  if (isWaitingKey) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
        <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)] px-4 py-3 flex items-center">
          <button
            onClick={() => navigate('/collections')}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white text-base font-bold ml-2">Waiting for Key</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <div className="max-w-[280px] space-y-3">
            <h3 className="text-white font-bold text-base">Key Handshake Pending</h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              Your request to join <strong>{collection.name}</strong> was accepted, but your device is waiting to receive the wrapped key envelope.
            </p>
            <p className="text-gray-500 text-[10px] bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 leading-relaxed">
              <strong>Secure Handshake Flow:</strong> Next time the collection owner or another active member with key permissions logs in, their client will securely wrap and publish your key envelope using zero-knowledge ECDH.
            </p>
          </div>
          <button
            onClick={() => navigate('/collections')}
            className="py-2.5 px-6 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold rounded-xl transition-all border border-white/5 active:scale-95"
          >
            Return to Vault List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/collections')}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors shrink-0"
            aria-label="Back to shared vaults"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-white text-base font-bold truncate">{collection.name}</h1>
            <p className="text-gray-500 text-[10px] truncate leading-none mt-0.5">
              {collection.description || 'Shared Zero-Knowledge Collection'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/collections/${collectionId}/access`)}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all relative"
            title="Manage members and access"
          >
            <Users className="w-4 h-4" />
          </button>
          {myRole !== 'viewer' && (
            <button
              onClick={handleOpenAddForm}
              className="p-1.5 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/20 active:scale-95 flex items-center gap-1 text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 pt-16">
            <div className="w-14 h-14 rounded-full bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center text-cyan-400">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div className="max-w-[240px]">
              <h3 className="text-white font-bold text-sm">Vault is Empty</h3>
              <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                Add your first zero-knowledge shared item. All changes are encrypted client-side and synced instantly.
              </p>
            </div>
            <button
              onClick={handleOpenAddForm}
              className="py-2 px-4 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-98"
            >
              Add Collection Item
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const isExpanded = expandedItemId === item.id;
              const isRevealed = revealedPasswords[item.id] || false;

              return (
                <div
                  key={item.id}
                  className={`bg-[#16213e] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 ${
                    isExpanded ? 'ring-1 ring-cyan-500/30 shadow-xl' : 'hover:border-white/10'
                  }`}
                >
                  {/* Top summary row */}
                  <div
                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                    className="flex items-center justify-between p-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5">
                        {getItemIcon(item.itemType)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white text-sm font-bold truncate">{item.title}</h3>
                        <p className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mt-0.5">
                          {item.itemType} • r{item.latestRevision}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5"
                    >
                      {isExpanded ? (
                        <EyeOff className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Expanded detail section */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/5 bg-[#121c36]/40 space-y-4 animate-in fade-in duration-300">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider pl-1">
                            Secret Payload / Credential
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => togglePasswordReveal(item.id)}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
                              title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                            >
                              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleCopy(item.plaintext, 'Payload')}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
                              title="Copy Secret"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="relative">
                          <input
                            type={isRevealed ? 'text' : 'password'}
                            readOnly
                            value={item.plaintext}
                            className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2 px-3 text-white text-xs font-mono focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Info badges */}
                      <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-gray-500">
                        <span className="bg-white/5 px-2 py-1 rounded">By: @{item.createdBy || 'member'}</span>
                        {item.updatedBy && item.updatedBy !== item.createdBy && (
                          <span className="bg-white/5 px-2 py-1 rounded">Edited: @{item.updatedBy}</span>
                        )}
                        <span className="bg-white/5 px-2 py-1 rounded">
                          {new Date(item.updatedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Controls */}
                      {myRole !== 'viewer' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5 justify-end">
                          <button
                            onClick={() => handleOpenEditForm(item)}
                            className="py-1.5 px-3 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 flex items-center gap-1 border border-white/5 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="py-1.5 px-3 rounded-lg text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 flex items-center gap-1 border border-rose-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Form Overlay Sheet */}
      {showFormSheet && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => !formLoading && setShowFormSheet(false)} />

          {/* Form container */}
          <form
            onSubmit={handleFormSubmit}
            className="relative w-full bg-[#16213e] border-t border-white/10 rounded-t-3xl p-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
          >
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto -mt-2.5 mb-1 opacity-45" />

            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <h2 className="text-white font-bold text-base">
                {editingItem ? 'Edit Shared Item' : 'New Shared Item'}
              </h2>
              <button
                type="button"
                disabled={formLoading}
                onClick={() => setShowFormSheet(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Item Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Server Login, API Access"
                  maxLength={50}
                  className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2.5 px-3.5 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Item Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['login', 'card', 'note'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 uppercase transition-all ${
                        formType === type
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-[#1a1a2e] border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      {getItemIcon(type)}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">
                  Secret Content (Password, Token, Text)
                </label>
                <textarea
                  value={formPlaintext}
                  onChange={(e) => setFormPlaintext(e.target.value)}
                  placeholder="Enter the sensitive payload (will be encrypted locally in client memory)..."
                  required
                  rows={4}
                  className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2.5 px-3.5 text-white text-xs font-mono focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-start gap-2 bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3 text-cyan-400 text-[10px] leading-relaxed">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>AES-256-GCM Zero-Knowledge:</strong> This secret is encrypted in your device's memory using a unique key derived for this item before it leaves your device. Plaintext is never stored in the database.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="w-full py-3 mt-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
            >
              {formLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Encrypting and committing...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {editingItem ? 'Save Updates' : 'Commit to Shared Vault'}
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
