// PURPOSE: Provides implementation and configuration for CollectionDetailPage.tsx.
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
  FolderOpen,
  Check,
  CheckSquare,
  Square,
  Layers,
  FolderHeart,
  Search,
  Fingerprint,
  Wifi,
  User as UserIcon
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
import { getVaultItems, addVaultChangeListener, subscribeToCustomCategories } from '../../store';
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
  const [addTab, setAddTab] = useState<'vault' | 'new'>('vault');
  const [formTitle, setFormTitle] = useState('');
  const [formPlaintext, setFormPlaintext] = useState('');
  const [formType, setFormType] = useState<'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other'>('login');
  const [formLoading, setFormLoading] = useState(false);

  // Personal Vault Items Picker State
  const [vaultItems, setVaultItems] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<any[]>([]);
  const [selectedVaultItemIds, setSelectedVaultItemIds] = useState<string[]>([]);
  const [pickerCategory, setPickerCategory] = useState<string>('all');
  const [pickerSearch, setPickerSearch] = useState<string>('');

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

  // 3. Subscribe to Personal Vault items and categories for the picker
  useEffect(() => {
    const unsubCats = subscribeToCustomCategories(setCustomCategories);
    setVaultItems(getVaultItems());
    const unsubVault = addVaultChangeListener(setVaultItems);
    return () => {
      unsubCats();
      unsubVault();
    };
  }, []);

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
    setAddTab('vault');
    setSelectedVaultItemIds([]);
    setPickerCategory('all');
    setPickerSearch('');
    setShowFormSheet(true);
  };

  const handleOpenEditForm = (item: DecryptedCollectionItemExtended) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormPlaintext(item.plaintext);
    setFormType(item.itemType as any);
    setAddTab('new');
    setShowFormSheet(true);
  };

  const handleImportSelected = async () => {
    if (!collectionId || selectedVaultItemIds.length === 0) return;
    setFormLoading(true);
    try {
      let count = 0;
      for (const id of selectedVaultItemIds) {
        const vItem = vaultItems.find((v) => v.id === id);
        if (!vItem) continue;
        const itemId = crypto.randomUUID();
        
        const rawType = (vItem.type || '').toLowerCase();
        let mappedType: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other' = 'login';
        if (rawType.includes('card')) mappedType = 'card';
        else if (rawType.includes('note')) mappedType = 'note';
        else if (rawType.includes('identity') || rawType.includes('passport') || rawType.includes('license') || rawType.includes('driver') || rawType.includes('aadhaar') || rawType.includes('employee')) mappedType = 'identity';
        else if (rawType.includes('wifi')) mappedType = 'wifi';
        else mappedType = 'login';

        let payloadParts: string[] = [];
        if (vItem.username && vItem.password) {
          payloadParts.push(`Username: ${vItem.username}\nPassword: ${vItem.password}`);
        } else if (vItem.username) {
          payloadParts.push(`Username: ${vItem.username}`);
        } else if (vItem.password) {
          payloadParts.push(`Password: ${vItem.password}`);
        }
        if (vItem.url) payloadParts.push(`URL: ${vItem.url}`);

        if (vItem.identityData) {
          const id = vItem.identityData;
          const name = [id.firstName, id.middleName, id.lastName].filter(Boolean).join(' ');
          if (name) payloadParts.push(`Full Name: ${name}`);
          if (id.email) payloadParts.push(`Email: ${id.email}`);
          if (id.phone) payloadParts.push(`Phone: ${id.phone}`);
          if (id.dateOfBirth) payloadParts.push(`DOB: ${id.dateOfBirth}`);
          if (id.company) payloadParts.push(`Company: ${id.company}`);
          if (id.ssn) payloadParts.push(`SSN/ID: ${id.ssn}`);
        }

        if (vItem.cardData) {
          const card = vItem.cardData;
          if (card.cardholderName) payloadParts.push(`Cardholder: ${card.cardholderName}`);
          if (card.number) payloadParts.push(`Card Number: ${card.number}`);
          if (card.expMonth && card.expYear) payloadParts.push(`Expiry: ${card.expMonth}/${card.expYear}`);
          if (card.cvv) payloadParts.push(`CVV: ${card.cvv}`);
        }

        if (vItem.addressData) {
          const addr = vItem.addressData;
          const fullAddr = [addr.streetAddress, addr.streetAddress2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ');
          if (fullAddr) payloadParts.push(`Address: ${fullAddr}`);
        }

        if (vItem.note) payloadParts.push(`Notes: ${vItem.note}`);

        const payload = payloadParts.join('\n\n') || vItem.password || '';

        const result = await commitSharedItem(
          collectionId,
          itemId,
          vItem.title || 'Untitled Item',
          payload,
          mappedType,
          0,
          vItem.id
        );
        if (result.success || !result.conflict) {
          count++;
        }
      }
      toast.success(`Successfully added ${count} item(s) from your vault!`);
      setShowFormSheet(false);
      setSelectedVaultItemIds([]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to import selected items');
    } finally {
      setFormLoading(false);
    }
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
      case 'identity':
        return <Fingerprint className="w-5 h-5 text-purple-400" />;
      case 'wifi':
        return <Wifi className="w-5 h-5 text-emerald-400" />;
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
          <div className="relative w-full max-h-[85vh] bg-[#16213e] border-t border-white/10 rounded-t-3xl p-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-4 shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto -mt-2.5 mb-1 opacity-45 shrink-0" />

            <div className="flex items-center justify-between border-b border-white/5 pb-2.5 shrink-0">
              <h2 className="text-white font-bold text-base">
                {editingItem ? 'Edit Shared Item' : 'Add to Shared Vault'}
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

            {!editingItem && (
              <div className="flex p-1 bg-[#1a1a2e] rounded-xl border border-white/5 shrink-0">
                <button
                  type="button"
                  onClick={() => setAddTab('vault')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    addTab === 'vault'
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Select from Vault
                </button>
                <button
                  type="button"
                  onClick={() => setAddTab('new')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    addTab === 'new'
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New
                </button>
              </div>
            )}

            {addTab === 'vault' && !editingItem ? (
              <div className="flex flex-col gap-3 overflow-hidden flex-1">
                {/* Search Bar */}
                <div className="relative shrink-0">
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search passwords by title, username, or URL..."
                    className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl py-2 pl-9 pr-3 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-cyan-500/40"
                  />
                  {pickerSearch && (
                    <button
                      onClick={() => setPickerSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Picker Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setPickerCategory('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                      pickerCategory === 'all'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-[#1a1a2e] text-gray-400 border-white/5 hover:text-white'
                    }`}
                  >
                    All Items ({vaultItems.filter(i => !i.deletedAt).length})
                  </button>
                  {customCategories.map((cat) => {
                    const count = vaultItems.filter(i => !i.deletedAt && i.categoryId === cat.id).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setPickerCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                          pickerCategory === cat.id
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-[#1a1a2e] text-gray-400 border-white/5 hover:text-white'
                        }`}
                      >
                        {cat.name} ({count})
                      </button>
                    );
                  })}
                  {(() => {
                    const uncategorizedCount = vaultItems.filter(i => !i.deletedAt && !i.categoryId).length;
                    if (uncategorizedCount === 0) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setPickerCategory('__uncategorized__')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                          pickerCategory === '__uncategorized__'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-[#1a1a2e] text-gray-400 border-white/5 hover:text-white'
                        }`}
                      >
                        Uncategorized ({uncategorizedCount})
                      </button>
                    );
                  })()}
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {(() => {
                    const query = pickerSearch.trim().toLowerCase();
                    const filtered = vaultItems.filter((i) => {
                      if (i.deletedAt) return false;
                      if (pickerCategory !== 'all') {
                        if (pickerCategory === '__uncategorized__' && i.categoryId) return false;
                        if (pickerCategory !== '__uncategorized__' && i.categoryId !== pickerCategory) return false;
                      }
                      if (query) {
                        const matchesTitle = (i.title || '').toLowerCase().includes(query);
                        const matchesUsername = (i.username || '').toLowerCase().includes(query);
                        const matchesUrl = (i.url || '').toLowerCase().includes(query);
                        return matchesTitle || matchesUsername || matchesUrl;
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500 text-xs">
                          {query ? `No passwords matching "${pickerSearch}"` : 'No passwords found in this category.'}
                        </div>
                      );
                    }

                    return filtered.map((item) => {
                      const isSelected = selectedVaultItemIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedVaultItemIds((prev) =>
                              isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]
                            );
                          }}
                          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] ${
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-500/50 text-white'
                              : 'bg-[#1a1a2e] border-white/5 text-gray-300 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="text-cyan-400 shrink-0">
                              {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-600" />}
                            </div>
                            <div className="overflow-hidden">
                              <h4 className="text-xs font-bold text-white truncate">{item.title || 'Untitled'}</h4>
                              <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.username || item.url || item.type}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-gray-400 uppercase shrink-0">
                            {item.type || 'Login'}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Action button */}
                <div className="pt-2 border-t border-white/5 flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400 font-semibold">
                      {selectedVaultItemIds.length} item(s) selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = vaultItems
                          .filter((i) => {
                            if (i.deletedAt) return false;
                            if (pickerCategory === 'all') return true;
                            if (pickerCategory === '__uncategorized__') return !i.categoryId;
                            return i.categoryId === pickerCategory;
                          })
                          .map((i) => i.id);
                        const allSelected = filteredIds.every((id) => selectedVaultItemIds.includes(id));
                        if (allSelected) {
                          setSelectedVaultItemIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
                        } else {
                          setSelectedVaultItemIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
                        }
                      }}
                      className="text-xs font-bold text-cyan-400 hover:underline"
                    >
                      Select / Deselect All
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={selectedVaultItemIds.length === 0 || formLoading}
                    onClick={handleImportSelected}
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 active:scale-[0.98]"
                  >
                    {formLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Encrypting & Importing...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Import Selected ({selectedVaultItemIds.length}) to Shared Vault
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-3.5 overflow-y-auto pr-1">
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

                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-3 mt-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
