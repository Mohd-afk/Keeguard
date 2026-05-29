import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import {
  Plus,
  Globe,
  Smartphone,
  Phone,
  DoorOpen,
  CreditCard,
  KeyRound,
  Shield,
  Star,
  SlidersHorizontal,
  Search,
  X,
  AlignJustify,
  Wrench,
  ChevronUp,
  ChevronDown,
  Trash2,
  CheckCircle2,
  Circle,
  MoreVertical,
  StickyNote,
  FileText,
  FolderOpen,
  Folder,
  Tag,
  LayoutGrid,
  List,
  ArrowLeft,
  BookTemplate,
  History,
  Share2,
} from 'lucide-react';
import {
  addVaultChangeListener,
  getVaultItems,
  toggleFavorite,
  updateVaultItem,
  deleteVaultItem,
  type VaultItem,
  type CustomCategory,
  subscribeToCustomCategories,
} from '../store';
import { useSmartSearch } from '../hooks/useSmartSearch';
import { useSort } from '../hooks/useSort';
import { Sidebar, type SidebarFilter } from './Sidebar';
import { TEMPLATES } from './AddEditForm';
import { SortModal } from './SortModal';
import type { User } from 'firebase/auth';
import { CategoryIconMap } from './ManageCategories';
import { toast } from 'sonner';

// ── Category chip definition ───────────────────────────────────────────
type CategoryChip = 'all' | 'favorites' | 'work' | 'personal' | 'expiring';

const CHIPS: { id: CategoryChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favourites' },
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
  { id: 'expiring', label: 'Expiring Soon' },
];

// ── Type icon/color maps ──────────────────────────────────────────────
const typeIcons: Record<string, React.ReactNode> = {
  Website: <Globe className="w-5 h-5 text-cyan-400" />,
  App: <Smartphone className="w-5 h-5 text-purple-400" />,
  Phone: <Phone className="w-5 h-5 text-green-400" />,
  'Door Lock': <DoorOpen className="w-5 h-5 text-amber-400" />,
  Card: <CreditCard className="w-5 h-5 text-pink-400" />,
  Other: <KeyRound className="w-5 h-5 text-gray-400" />,
};

const typeColors: Record<string, string> = {
  Website: 'bg-cyan-500/10',
  App: 'bg-purple-500/10',
  Phone: 'bg-green-500/10',
  'Door Lock': 'bg-amber-500/10',
  Card: 'bg-pink-500/10',
  Other: 'bg-gray-500/10',
};

import { BottomNav, type BottomTab } from './BottomNav';
import { BellIcon } from './topbar/BellIcon';

interface ItemCardProps {
  item: VaultItem;
  onNavigate: (id: string) => void;
  onFavorite: (id: string) => void;
  favLoading: string | null;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  searchQuery?: string;
}

// Helper component for keyword highlighting
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim()) return <span>{text}</span>;
  
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <span>{text}</span>;
  
  // Escaping special characters for regex safety
  const escapedTokens = tokens.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
  
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = tokens.some(t => part.toLowerCase() === t);
        return isMatch ? (
          <mark key={i} className="bg-cyan-500/35 text-cyan-200 px-0.5 rounded font-semibold select-none">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </span>
  );
}

function ItemCard({ item, onNavigate, onFavorite, favLoading, isSelectionMode, isSelected, onToggleSelect, onLongPress, searchQuery = '' }: ItemCardProps) {
  let timer: any;
  const handleTouchStart = () => {
    timer = setTimeout(() => { if (onLongPress) onLongPress(item.id); }, 500);
  };
  const handleTouchEnd = () => { clearTimeout(timer); };

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors relative group ${isSelected ? 'bg-cyan-500/10 hover:bg-cyan-500/20' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {isSelectionMode && (
        <button onClick={() => onToggleSelect && onToggleSelect(item.id)} className="p-1 shrink-0">
          {isSelected ? <CheckCircle2 className="w-5 h-5 text-cyan-400" /> : <Circle className="w-5 h-5 text-gray-500" />}
        </button>
      )}

      {/* Icon */}
      <button
        onClick={() => isSelectionMode ? onToggleSelect && onToggleSelect(item.id) : onNavigate(item.id)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div
          className={`w-10 h-10 rounded-xl ${
            typeColors[item.type] ?? 'bg-gray-500/10'
          } flex items-center justify-center shrink-0`}
        >
          {typeIcons[item.type] ?? <KeyRound className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm truncate font-medium">
            <HighlightedText text={item.title} query={searchQuery} />
          </p>
          <p className="text-gray-500 text-xs truncate mt-0.5">
            <HighlightedText text={item.username || item.url || item.type} query={searchQuery} />
          </p>
          {item.labels && item.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.labels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="text-[9px] font-semibold bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20"
                >
                  <HighlightedText text={lbl} query={searchQuery} />
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Star button (hide in selection mode) */}
      {!isSelectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(item.id);
          }}
          disabled={favLoading === item.id}
          className={`p-2 rounded-lg transition-all shrink-0 ${
            item.isFavorite
              ? 'text-cyan-400'
              : 'text-gray-600 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
          aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className="w-4 h-4"
            fill={item.isFavorite ? 'currentColor' : 'none'}
          />
        </button>
      )}
    </div>
  );
}

// ── Main PasswordList ──────────────────────────────────────────────────
interface PasswordListProps {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function PasswordList({ onLock: _onLock, user }: PasswordListProps) {
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen, sidebarFilter, setSidebarFilter, setNotificationDrawerOpen } = useOutletContext<{
    sidebarOpen: boolean;
    setSidebarOpen: (o: boolean) => void;
    sidebarFilter: SidebarFilter;
    setSidebarFilter: (f: SidebarFilter) => void;
    setNotificationDrawerOpen: (o: boolean) => void;
  }>();
  const [items, setItems] = useState<VaultItem[]>(getVaultItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState<CategoryChip>('all');
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>('safe');
  const [favLoading, setFavLoading] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // In grid mode, clicking a category card opens a detail sub-view
  const [activeCategoryDetail, setActiveCategoryDetail] = useState<string | null>(null);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);

  // Favourites & Recently Added Collapsible Section states
  const [favouritesExpanded, setFavouritesExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [showAllFavourites, setShowAllFavourites] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

  // ── Full Power Search Upgrades (D1) ──────────────────────────────────
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('securevault_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const saveSearchQuery = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(x => x.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('securevault_recent_searches', JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Filter chain ────────────────────────────────────────────────────
  const activeVaultItems = useMemo(
    () => items.filter((i) => !i.deletedAt),
    [items],
  );

  const mostAccessedItems = useMemo(() => {
    const activeItems = activeVaultItems;
    const favs = activeItems.filter(i => i.isFavorite);
    if (favs.length > 0) return favs.slice(0, 3);
    return activeItems.slice(0, 3);
  }, [activeVaultItems]);

  // Favourites list
  const favouriteItems = useMemo(() => {
    return activeVaultItems.filter(i => i.isFavorite);
  }, [activeVaultItems]);

  // Recently added list (sorted by updatedAt or createdAt descending)
  const recentlyAddedItems = useMemo(() => {
    return [...activeVaultItems]
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 8);
  }, [activeVaultItems]);

  // Live vault sync
  useEffect(() => {
    const unsub = addVaultChangeListener((updated) => setItems([...updated]));
    return unsub;
  }, []);
  useEffect(() => {
    setItems(getVaultItems());
  }, []);

  // Live categories sync
  useEffect(() => {
    const unsub = subscribeToCustomCategories((categories) => {
      setCustomCategories(categories);
    });
    return unsub;
  }, []);

  // ── Handle bottom tab navigation ────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'security') navigate('/security');
    else if (activeTab === 'tools') navigate('/generator');
    else if (activeTab === 'search') {
      // Focus search
      const el = document.getElementById('smart-search-input');
      if (el) (el as HTMLInputElement).focus();
      setActiveTab('safe');
    }
  }, [activeTab, navigate]);

  // Core Vault Categories Heuristics and Item Count Calculations
  const categoryCounts = useMemo(() => {
    let passwords = 0;
    let notes = 0;
    let cards = 0;
    let ids = 0;
    let docs = 0;
    let devices = 0;
    const custom: Record<string, number> = {};

    activeVaultItems.forEach((item) => {
      if (item.categoryId) {
        custom[item.categoryId] = (custom[item.categoryId] || 0) + 1;
      }

      const titleLower = item.title.toLowerCase();

      if (item.type === 'Website' || item.type === 'App') {
        passwords++;
      } else if (item.type === 'Card') {
        cards++;
      } else if (item.type === 'Phone' || item.type === 'Door Lock') {
        devices++;
      } else if (item.type === 'Other') {
        const isId = titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
        const isDoc = titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
        
        if (isId) {
          ids++;
        } else if (isDoc) {
          docs++;
        } else {
          notes++;
        }
      }
    });

    return { passwords, notes, cards, ids, docs, devices, custom };
  }, [activeVaultItems]);

  // 1. Sidebar filter
  const sidebarFiltered = useMemo(() => {
    if (sidebarFilter === 'trash') return items.filter((i) => !!i.deletedAt);
    if (sidebarFilter.startsWith('category-')) {
      const catId = sidebarFilter.replace('category-', '');
      return activeVaultItems.filter((i) => i.categoryId === catId);
    }
    // Built-in type filters from sidebar
    if (sidebarFilter === 'codes')
      return activeVaultItems.filter((i) => !!i.totpSecretEncrypted || !!i.totpSecret);
    if (sidebarFilter === 'cards')
      return activeVaultItems.filter((i) => i.type === 'Card');
    if (sidebarFilter === 'notes')
      return activeVaultItems.filter((i) => !!i.note && !i.password);
    if (sidebarFilter === 'ids')
      return activeVaultItems.filter((i) => {
        const t = i.title.toLowerCase();
        return t.includes('id') || t.includes('passport') || t.includes('license') || t.includes('ssn');
      });
    if (sidebarFilter === 'expiring') {
      return activeVaultItems.filter((i) => {
        const noteLower = (i.note || '').toLowerCase();
        const titleLower = i.title.toLowerCase();
        return i.labels?.some(l => l.toLowerCase().includes('expiring')) || noteLower.includes('expiring') || titleLower.includes('expiring');
      });
    }
    if (sidebarFilter === 'templates') {
      return activeVaultItems.filter((i) => !!i.note && i.note.startsWith('__template__:'));
    }
    if (sidebarFilter === 'passkeys')
      return [];
    return activeVaultItems;
  }, [activeVaultItems, sidebarFilter, items]);

  // 1b. Core Vault Category filter
  const coreCategoryFiltered = useMemo(() => {
    if (!activeCategory) return sidebarFiltered;

    return sidebarFiltered.filter((item) => {
      const titleLower = item.title.toLowerCase();

      if (activeCategory === 'passwords') {
        return item.type === 'Website' || item.type === 'App';
      }
      if (activeCategory === 'cards') {
        return item.type === 'Card';
      }
      if (activeCategory === 'devices') {
        return item.type === 'Phone' || item.type === 'Door Lock';
      }
      if (activeCategory === 'ids') {
        if (item.type !== 'Other') return false;
        return titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
      }
      if (activeCategory === 'docs') {
        if (item.type !== 'Other') return false;
        return titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
      }
      if (activeCategory === 'notes') {
        if (item.type !== 'Other') return false;
        const isId = titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
        const isDoc = titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
        return !isId && !isDoc;
      }
      // Match custom category ID
      return item.categoryId === activeCategory;
    });
  }, [sidebarFiltered, activeCategory]);

  // 2. Category chip filter (layered on top of core categories)
  const chipFiltered = useMemo(() => {
    switch (activeChip) {
      case 'favorites':
        return coreCategoryFiltered.filter((i) => i.isFavorite);
      case 'work':
        return coreCategoryFiltered.filter((i) => i.categoryId === 'cat_work' || i.labels?.some(l => l.toLowerCase() === 'work'));
      case 'personal':
        return coreCategoryFiltered.filter((i) => i.categoryId === 'cat_personal' || i.labels?.some(l => l.toLowerCase() === 'personal'));
      case 'expiring':
        return coreCategoryFiltered.filter((i) => {
          const noteLower = i.note.toLowerCase();
          const titleLower = i.title.toLowerCase();
          return i.labels?.some(l => l.toLowerCase().includes('expiring')) || noteLower.includes('expiring') || titleLower.includes('expiring');
        });
      default:
        return coreCategoryFiltered;
    }
  }, [coreCategoryFiltered, activeChip]);

  // 3. Smart search
  const searchFiltered = useSmartSearch(chipFiltered, debouncedQuery, customCategories);

  // 4. Sort
  const { sortedItems, sortOption, setSortOption } = useSort(searchFiltered);

  // Group by type
  const grouped = useMemo(() => {
    const map = new Map<string, VaultItem[]>();
    sortedItems.forEach(item => {
      const type = item.type;
      const existing = map.get(type) || [];
      existing.push(item);
      map.set(type, existing);
    });
    return map;
  }, [sortedItems]);

  // ── Category detail items ───────────────────────────────────────────
  const detailItems = useMemo(() => {
    if (!activeCategoryDetail) return [];
    return activeVaultItems.filter(item => {
      const t = item.title.toLowerCase();
      if (activeCategoryDetail === 'passwords') return item.type === 'Website' || item.type === 'App';
      if (activeCategoryDetail === 'cards') return item.type === 'Card';
      if (activeCategoryDetail === 'devices') return item.type === 'Phone' || item.type === 'Door Lock';
      if (activeCategoryDetail === 'ids') return item.type === 'Other' && (t.includes('id') || t.includes('passport') || t.includes('license'));
      if (activeCategoryDetail === 'docs') return item.type === 'Other' && (t.includes('doc') || t.includes('pdf') || t.includes('file') || t.includes('cert'));
      if (activeCategoryDetail === 'notes') {
        const isId = t.includes('id') || t.includes('passport') || t.includes('license');
        const isDoc = t.includes('doc') || t.includes('pdf') || t.includes('file') || t.includes('cert');
        return item.type === 'Other' && !isId && !isDoc;
      }
      return item.categoryId === activeCategoryDetail;
    });
  }, [activeVaultItems, activeCategoryDetail]);

  // ── Favorite toggle ──────────────────────────────────────────────────
  const handleFavorite = useCallback(async (id: string) => {
    setFavLoading(id);
    try {
      await toggleFavorite(id);
      setItems(getVaultItems());
    } finally {
      setFavLoading(null);
    }
  }, []);

  const userInitial = (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase();
  const totalActive = activeVaultItems.length;

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleLongPress = (id: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
    }
  };



  const handleBulkDelete = async () => {
    if (!window.confirm(`Move ${selectedIds.size} items to recycle bin?`)) return;
    for (const id of Array.from(selectedIds)) {
      await deleteVaultItem(id);
    }
    setItems(getVaultItems());
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async (categoryId: string | null) => {
    if (categoryId && sidebarFilter === `category-${categoryId}`) {
      toast.info("Items are already in this category");
      setIsMoveModalOpen(false);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      return;
    }
    try {
      const itemsCount = selectedIds.size;
      const targetCat = categoryId ? customCategories.find(c => c.id === categoryId) : null;
      const targetName = targetCat ? targetCat.name : 'No Category';

      for (const id of Array.from(selectedIds)) {
        await updateVaultItem(id, { categoryId: categoryId || undefined });
      }
      setItems([...getVaultItems()]);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setIsMoveModalOpen(false);
      toast.success(`Moved ${itemsCount} ${itemsCount === 1 ? 'item' : 'items'} to "${targetName}"`);
    } catch (err) {
      toast.error('Failed to move items');
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col animate-page">
      {/* ── Sort Modal ──────────────────────────────────────────────── */}
      <SortModal
        open={sortModalOpen}
        onClose={() => setSortModalOpen(false)}
        value={sortOption}
        onChange={setSortOption}
      />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        {/* Top row */}
        {isSelectionMode ? (
          <div className="flex items-center justify-between px-4 py-3 bg-[#16213e]/75 backdrop-blur-md border-b border-cyan-500/20 animate-in slide-in-from-top-2 duration-200 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                aria-label="Cancel selection"
              >
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-white text-lg font-semibold">{selectedIds.size} selected</h1>
            </div>
            <button
              onClick={() => {
                const targetItems = activeCategoryDetail ? detailItems : sortedItems;
                if (selectedIds.size === targetItems.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(targetItems.map(i => i.id)));
                }
              }}
              className="text-cyan-400 font-medium text-sm px-2"
            >
              {selectedIds.size === (activeCategoryDetail ? detailItems.length : sortedItems.length) ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                aria-label="Open menu"
              >
                <AlignJustify className="w-5 h-5" />
              </button>
              <h1 className="text-white text-xl font-semibold">Safe</h1>
            </div>
            <div className="flex items-center gap-2">
              <BellIcon onClick={() => setNotificationDrawerOpen(true)} />
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center ml-1"
                title={user.email ?? 'Signed in'}
              >
                <span className="text-white text-sm font-bold">{userInitial}</span>
              </div>
            </div>
          </div>
        )}

        {/* Smart Search */}
        <div className="px-4 pb-3 relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              id="smart-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveSearchQuery(searchQuery);
                }
              }}
              placeholder="Search Title, Username, URL, Notes, Tags..."
              className="w-full bg-[#16213e] border border-white/5 rounded-2xl py-2.5 pl-10 pr-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setSortModalOpen(true)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                aria-label="Sort"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart Suggestions Dropdown */}
          {isSearchFocused && !searchQuery && (
            <div className="absolute top-full left-4 right-4 mt-2 bg-[#16213e] border border-gray-700/60 rounded-2xl p-4 z-50 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-2">Recent Searches</h3>
                  <div className="flex flex-wrap gap-2 animate-in fade-in duration-200">
                    {recentSearches.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={() => {
                          setSearchQuery(s);
                          saveSearchQuery(s);
                        }}
                        className="text-xs bg-white/5 hover:bg-cyan-500/15 hover:text-cyan-400 text-gray-300 px-3 py-1.5 rounded-full border border-gray-700/30 transition-all active:scale-95"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Most Accessed Items */}
              <div>
                <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-2">Suggested / Most Accessed</h3>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {mostAccessedItems.length === 0 ? (
                    <p className="text-gray-500 text-xs py-1">No items found</p>
                  ) : (
                    mostAccessedItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => {
                          navigate(`/item/${item.id}`);
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-cyan-500/10 text-left transition-all group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400`}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-200 group-hover:text-white truncate">{item.title}</p>
                            <p className="text-[10px] text-gray-500 truncate">{item.username || item.url || item.type}</p>
                          </div>
                        </div>
                        <Star className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill={item.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_96px)]">

        {/* Favourites & Recently Added Sections */}
        {!activeCategoryDetail && !searchQuery && sidebarFilter === 'all' && !isSelectionMode && (
          <div className="pt-2 space-y-4">
            {/* Favourites Section */}
            <div className="px-4">
              <button
                onClick={() => setFavouritesExpanded(!favouritesExpanded)}
                className="w-full flex items-center justify-between py-2 text-left group hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-cyan-400" fill={favouritesExpanded ? "currentColor" : "none"} />
                  <span className="text-white text-sm font-semibold">Favourites</span>
                  <span className="text-gray-500 text-xs bg-white/5 px-2 py-0.5 rounded-full">{favouriteItems.length}</span>
                </div>
                <div className="text-gray-400">
                  {favouritesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {favouritesExpanded && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {favouriteItems.length === 0 ? (
                    <div className="bg-[#16213e]/40 border border-white/5 rounded-2xl p-4 text-center">
                      <p className="text-gray-400 text-xs">Tap the ★ on any item to add it here</p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div 
                      className="flex gap-3 overflow-x-auto pb-2" 
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {favouriteItems.slice(0, 4).map(item => (
                        <button
                          key={item.id}
                          onClick={() => navigate(`/item/${item.id}`)}
                          className="flex-shrink-0 w-32 p-3 bg-[#16213e] border border-white/5 rounded-2xl text-left hover:border-cyan-500/30 transition-all active:scale-[0.97]"
                        >
                          <div className={`w-8 h-8 rounded-lg ${typeColors[item.type] ?? 'bg-gray-500/10'} flex items-center justify-center mb-2`}>
                            {typeIcons[item.type] ?? <KeyRound className="w-4 h-4 text-gray-400" />}
                          </div>
                          <p className="text-white text-xs font-semibold truncate">{item.title}</p>
                          <p className="text-gray-500 text-[10px] truncate mt-0.5">{item.username || item.type}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="bg-[#16213e] rounded-2xl overflow-hidden divide-y divide-white/5">
                        {favouriteItems.slice(0, showAllFavourites ? undefined : 3).map(item => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            onNavigate={(id) => navigate(`/item/${id}`)}
                            onFavorite={handleFavorite}
                            favLoading={favLoading}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(item.id)}
                            onToggleSelect={handleToggleSelect}
                            onLongPress={handleLongPress}
                          />
                        ))}
                      </div>
                      {favouriteItems.length > 3 && (
                        <div className="flex justify-end pr-1">
                          <button
                            onClick={() => setShowAllFavourites(!showAllFavourites)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                          >
                            {showAllFavourites ? 'Show Less' : 'See All'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recently Added Section */}
            {recentlyAddedItems.length > 0 && (
              <div className="px-4">
                <button
                  onClick={() => setRecentExpanded(!recentExpanded)}
                  className="w-full flex items-center justify-between py-2 text-left group hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span className="text-white text-sm font-semibold">Recently Added</span>
                    <span className="text-gray-500 text-xs bg-white/5 px-2 py-0.5 rounded-full">{recentlyAddedItems.length}</span>
                  </div>
                  <div className="text-gray-400">
                    {recentExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {recentExpanded && (
                  <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    {viewMode === 'grid' ? (
                      <div 
                        className="flex gap-3 overflow-x-auto pb-2" 
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {recentlyAddedItems.map(item => (
                          <button
                            key={item.id}
                            onClick={() => navigate(`/item/${item.id}`)}
                            className="flex-shrink-0 w-32 p-3 bg-[#16213e] border border-white/5 rounded-2xl text-left hover:border-cyan-500/30 transition-all active:scale-[0.97]"
                          >
                            <div className={`w-8 h-8 rounded-lg ${typeColors[item.type] ?? 'bg-gray-500/10'} flex items-center justify-center mb-2`}>
                              {typeIcons[item.type] ?? <KeyRound className="w-4 h-4 text-gray-400" />}
                            </div>
                            <p className="text-white text-xs font-semibold truncate">{item.title}</p>
                            <p className="text-gray-500 text-[10px] truncate mt-0.5">{item.username || item.type}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-[#16213e] rounded-2xl overflow-hidden divide-y divide-white/5">
                          {recentlyAddedItems.slice(0, showAllRecent ? undefined : 3).map(item => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              onNavigate={(id) => navigate(`/item/${id}`)}
                              onFavorite={handleFavorite}
                              favLoading={favLoading}
                              isSelectionMode={isSelectionMode}
                              isSelected={selectedIds.has(item.id)}
                              onToggleSelect={handleToggleSelect}
                              onLongPress={handleLongPress}
                            />
                          ))}
                        </div>
                        {recentlyAddedItems.length > 3 && (
                          <div className="flex justify-end pr-1">
                            <button
                              onClick={() => setShowAllRecent(!showAllRecent)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                            >
                              {showAllRecent ? 'Show Less' : 'See All'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES MODE: Templates Catalog ─────────────────────── */}
        {sidebarFilter === 'templates' && (
          <div className="px-4 py-4 space-y-4">
            {/* Banner/Header */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <h2 className="text-white text-base font-bold flex items-center gap-2">
                <BookTemplate className="w-5 h-5 text-cyan-400" /> Premium Vault Templates
              </h2>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                Choose a structured template below to quickly create a highly optimized vault entry. Predefined fields ensure advanced organization and enhanced security.
              </p>
            </div>

            {/* Template Catalog Grid */}
            <div className="grid grid-cols-2 gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {TEMPLATES.map((tmpl) => {
                const IconComp = tmpl.icon;
                // Curate card style colors/borders based on template
                let accentColor = '#06b6d4'; // default cyan
                if (tmpl.id === 'email') accentColor = '#10b981'; // green
                else if (tmpl.id === 'banking') accentColor = '#f59e0b'; // amber
                else if (tmpl.id === 'social') accentColor = '#ec4899'; // pink
                else if (tmpl.id === 'gaming') accentColor = '#8b5cf6'; // purple
                else if (tmpl.id === 'cards') accentColor = '#ef4444'; // red
                else if (tmpl.id === 'crypto') accentColor = '#eab308'; // yellow
                else if (tmpl.id === 'vpn') accentColor = '#3b82f6'; // blue
                
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => navigate(`/add?template=${tmpl.id}`)}
                    className="p-4 rounded-2xl border border-white/5 bg-[#16213e] hover:bg-[#1f2d52] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98] flex flex-col justify-between min-h-[110px] shadow-md hover:shadow-lg hover:border-cyan-500/30"
                  >
                    {/* Top row */}
                    <div className="flex justify-between items-start w-full">
                      <div className="p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                        {tmpl.type}
                      </span>
                    </div>

                    {/* Bottom details */}
                    <div className="mt-3">
                      <p className="text-white font-semibold text-xs group-hover:text-cyan-400 transition-colors truncate">
                        {tmpl.name}
                      </p>
                      <p className="text-gray-500 text-[10px] mt-0.5 truncate">
                        {tmpl.fields.length} predefined fields
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>


          </div>
        )}

        {/* ── GRID MODE: Category Detail Page ─────────────────────── */}
        {viewMode === 'grid' && activeCategoryDetail && (() => {
          const detailLabel = activeCategoryDetail;
          const catName = (() => {
            if (detailLabel === 'passwords') return 'Passwords';
            if (detailLabel === 'cards') return 'Cards';
            if (detailLabel === 'devices') return 'Devices';
            if (detailLabel === 'ids') return 'IDs';
            if (detailLabel === 'docs') return 'Documents';
            if (detailLabel === 'notes') return 'Notes';
            return customCategories.find(c => c.id === detailLabel)?.name || detailLabel;
          })();
          return (
            <>
              {/* Category detail header bar */}
              <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => setActiveCategoryDetail(null)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-white font-semibold text-base flex-1">{catName}</span>
                <span className="text-gray-500 text-sm">{detailItems.length} items</span>
              </div>
              {detailItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <KeyRound className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 text-base font-medium text-center">No items in this category</p>
                  <p className="text-gray-600 text-sm text-center mt-1">Add items and assign them to this category</p>
                </div>
              ) : (
                <div className="bg-[#16213e] mx-3 mt-3 rounded-2xl overflow-hidden divide-y divide-white/5 shadow-lg">
                  {detailItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onNavigate={(id) => navigate(`/item/${id}`)}
                      onFavorite={handleFavorite}
                      favLoading={favLoading}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedIds.has(item.id)}
                      onToggleSelect={handleToggleSelect}
                      onLongPress={handleLongPress}
                    />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* ── GRID MODE: Category Cards Grid ──────────────────────── */}
        {viewMode === 'grid' && !activeCategoryDetail && !isSelectionMode && !searchQuery && sidebarFilter === 'all' && (
          <div className="px-4 py-3">
            <div className="flex justify-between items-center mb-3 px-1">
              <h2 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Vault Categories</h2>
              <div className="flex items-center gap-1.5">
                {/* View mode toggle */}
                <button
                  onClick={() => { setViewMode(v => v === 'grid' ? 'list' : 'grid'); setActiveCategoryDetail(null); }}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  title="Switch to List View"
                >
                  <List className="w-4.5 h-4.5" />
                </button>
                {/* Select Mode */}
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  title="Select Items"
                >
                  <CheckCircle2 className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Passwords */}
              <button
                onClick={() => setActiveCategoryDetail('passwords')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-cyan-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-cyan-400"><KeyRound className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.passwords}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Passwords</p>
                <p className="text-gray-500 text-xs mt-0.5">Logins &amp; portals</p>
              </button>

              {/* Cards */}
              <button
                onClick={() => setActiveCategoryDetail('cards')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-pink-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400"><CreditCard className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.cards}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Cards</p>
                <p className="text-gray-500 text-xs mt-0.5">Debit &amp; credit cards</p>
              </button>

              {/* Notes */}
              <button
                onClick={() => setActiveCategoryDetail('notes')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-amber-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400"><StickyNote className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.notes}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Notes</p>
                <p className="text-gray-500 text-xs mt-0.5">Secure entries &amp; keys</p>
              </button>

              {/* IDs */}
              <button
                onClick={() => setActiveCategoryDetail('ids')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-emerald-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><FileText className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.ids}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">IDs</p>
                <p className="text-gray-500 text-xs mt-0.5">Passports &amp; licenses</p>
              </button>

              {/* Documents */}
              <button
                onClick={() => setActiveCategoryDetail('docs')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-purple-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400"><FolderOpen className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.docs}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Documents</p>
                <p className="text-gray-500 text-xs mt-0.5">Secure files &amp; certs</p>
              </button>

              {/* Devices */}
              <button
                onClick={() => setActiveCategoryDetail('devices')}
                className="p-3.5 rounded-2xl border border-white/5 hover:border-rose-500/30 bg-[#16213e] text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400"><Smartphone className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{categoryCounts.devices}</span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Devices</p>
                <p className="text-gray-500 text-xs mt-0.5">Phones &amp; smartlocks</p>
              </button>

              {/* Custom Categories */}
              {customCategories.filter(cat => !cat.isHidden).map((cat) => {
                const count = categoryCounts.custom[cat.id] || 0;
                return (
                  <div key={cat.id} className="relative group/catcard">
                    <button
                      onClick={() => setActiveCategoryDetail(cat.id)}
                      className="w-full p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group active:scale-[0.98]"
                      style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#16213e' }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                          <Shield className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">{count}</span>
                      </div>
                      <p className="text-white font-medium text-sm mt-3 truncate">{cat.name}</p>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">Custom category</p>
                    </button>
                    {/* Share button — appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/collections');
                      }}
                      title={`Share "${cat.name}"`}
                      className="absolute top-2 right-2 opacity-0 group-hover/catcard:opacity-100 p-1.5 rounded-lg bg-[#1a1a2e]/80 hover:bg-cyan-500/10 text-gray-500 hover:text-cyan-400 transition-all duration-200 border border-white/5 hover:border-cyan-500/20"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LIST MODE or sidebar-filtered content ───────────────── */}
        {(viewMode === 'list' || isSelectionMode || searchQuery || (sidebarFilter !== 'all' && sidebarFilter !== 'templates')) && !activeCategoryDetail && (
          <>
            {/* Header row in list mode */}
            {!isSelectionMode && !searchQuery && (
              <div className="flex justify-between items-center mb-1.5 px-5 mt-2">
                <h2 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">
                  {sidebarFilter !== 'all' ? `${sidebarFilter} Items` : 'Vault Items'}
                </h2>
                <div className="flex items-center gap-1.5">
                  {/* View mode toggle */}
                  <button
                    onClick={() => { setViewMode(v => { const next = v === 'grid' ? 'list' : 'grid'; if (next === 'list') setActiveChip('all'); return next; }); setActiveCategoryDetail(null); }}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                    title="Switch to Grid View"
                  >
                    <LayoutGrid className="w-4.5 h-4.5" />
                  </button>
                  {/* Select Mode */}
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                    title="Select Items"
                  >
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Category Active Filtering Banner */}
            {activeCategory && sidebarFilter === 'all' && (
              <div className="mx-4 mt-2 mb-3 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Viewing Category:</span>
                  <span className="text-sm font-bold text-white capitalize">{activeCategory}</span>
                </div>
                <button
                  onClick={() => setActiveCategory(null)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Clear Filter
                </button>
              </div>
            )}

            {/* Empty state — no search results */}
            {sortedItems.length === 0 && searchQuery ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-cyan-400" />
                </div>
                <p className="text-white text-base font-semibold text-center">No results found for "{searchQuery}"</p>
                <div className="mt-4 p-4 bg-[#16213e] border border-white/5 rounded-2xl max-w-xs text-center w-full">
                  <p className="text-gray-400 text-xs font-semibold">Tips to improve search:</p>
                  <ul className="text-gray-500 text-xs mt-1.5 space-y-1 text-left list-disc list-inside">
                    <li>Double check spelling</li>
                    <li>Search usernames, URLs, or labels</li>
                    <li>Filter by categories</li>
                  </ul>
                </div>
                <button
                  onClick={() => navigate('/add')}
                  className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-cyan-500/15 transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  Create New Item
                </button>
              </div>
            ) : sortedItems.length === 0 && activeChip === 'favorites' ? (
              /* Empty favorites */
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                  <Star className="w-8 h-8 text-cyan-400" fill="currentColor" />
                </div>
                <p className="text-white text-base font-medium text-center">No favorites here</p>
                <p className="text-gray-500 text-sm text-center mt-2 max-w-xs">
                  Mark cards as favorites by tapping the ★ star icon on any item.
                </p>
              </div>
            ) : sortedItems.length === 0 ? (
              /* Empty vault */
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <KeyRound className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400 text-base font-medium text-center">
                  {sidebarFilter === 'templates' 
                    ? 'No template entries saved yet' 
                    : (totalActive === 0 ? 'No passwords saved yet' : 'No items in this category')}
                </p>
                <p className="text-gray-600 text-sm text-center mt-1">
                  {sidebarFilter === 'templates' 
                    ? 'Choose a template above to create your first entry' 
                    : (totalActive === 0 ? 'Tap + to add your first password' : 'Try a different filter')}
                </p>
              </div>
            ) : (
              /* Item list */
              <div className="px-3 space-y-4 mt-3">
                {Array.from(grouped.entries()).map(([type, typeItems]) => {
                  const isExpanded = expandedCategories[type] === true; // Default false
                  return (
                    <div key={type}>
                      <button
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [type]: !isExpanded }))}
                        className="w-full flex items-center justify-between mb-2 px-2 hover:bg-white/5 rounded-lg py-1.5 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs uppercase tracking-wider font-semibold">{type}</span>
                          <span className="text-gray-600 text-xs">({typeItems.length})</span>
                        </div>
                        <div className="text-gray-500 group-hover:text-gray-300 transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="bg-[#16213e] rounded-2xl overflow-hidden divide-y divide-white/5 shadow-lg">
                          {typeItems.map((item) => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              onNavigate={(id) => {
                                saveSearchQuery(debouncedQuery);
                                navigate(`/item/${id}`);
                              }}
                              onFavorite={handleFavorite}
                              favLoading={favLoading}
                              isSelectionMode={isSelectionMode}
                              isSelected={selectedIds.has(item.id)}
                              onToggleSelect={handleToggleSelect}
                              onLongPress={handleLongPress}
                              searchQuery={debouncedQuery}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Item count footer */}
        {sortedItems.length > 0 && (viewMode === 'list' || isSelectionMode || searchQuery || sidebarFilter !== 'all') && !activeCategoryDetail && (
          <p className="text-center text-gray-600 text-xs mt-4 mb-2">
            {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'}
            {totalActive !== sortedItems.length
              ? ` of ${totalActive} total`
              : ''}
          </p>
        )}
      </div>


      {/* ── FAB ─────────────────────────────────────────────────────── */}
      {!isSelectionMode && (
        <button
          onClick={() => navigate('/add', { state: { prefilledCategory: activeCategory } })}
          className="fixed right-5 z-20 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform"
          style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 4px) + 64px)' }}
          aria-label="Add new password"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* ── Selection Action Bar ────────────────────────────────────── */}
      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#16213e]/80 backdrop-blur-md border-t border-white/5 pb-[max(env(safe-area-inset-bottom),_4px)]">
          <div className="flex items-center justify-around py-3 px-4" style={{ maxWidth: '448px', margin: '0 auto' }}>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0}
              className="flex flex-col items-center gap-1 text-red-400 disabled:opacity-50 transition-opacity"
            >
              <Trash2 className="w-6 h-6" />
              <span className="text-[10px] font-medium text-gray-300">Delete</span>
            </button>
            <button
              onClick={() => setIsMoveModalOpen(true)}
              disabled={selectedIds.size === 0}
              className="flex flex-col items-center gap-1 text-cyan-400 disabled:opacity-50 transition-opacity"
            >
              <FolderOpen className="w-6 h-6" />
              <span className="text-[10px] font-medium text-gray-300">Move</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Move to Category Modal ────────────────────────────────── */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#16213e] border border-white/10 rounded-3xl w-full max-w-sm max-h-[75vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div>
                <h3 className="text-white text-base font-bold">Move to Category</h3>
                <p className="text-xs text-gray-400 mt-0.5">Select a destination for {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'}</p>
              </div>
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-2 divide-y divide-white/5">
              {/* Option: None / No category */}
              <button
                onClick={() => handleBulkMove(null)}
                className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-white/5 active:bg-white/10 transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">No Category</p>
                  <p className="text-gray-500 text-xs mt-0.5">Remove from current category</p>
                </div>
              </button>

              {/* Categories list */}
              <div className="py-2">
                {(() => {
                  const parents = customCategories.filter(c => !c.parentCategoryId);
                  return parents.map(parent => {
                    const children = customCategories.filter(c => c.parentCategoryId === parent.id);
                    const ParentIcon = CategoryIconMap[parent.icon || 'Folder'] || Folder;
                    
                    return (
                      <div key={parent.id} className="space-y-1">
                        {/* Parent Category */}
                        <button
                          onClick={() => handleBulkMove(parent.id)}
                          className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-white/5 active:bg-white/10 transition-colors group"
                        >
                          <div 
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                            style={{ backgroundColor: `${parent.color}15`, color: parent.color }}
                          >
                            <ParentIcon className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <p className="text-white text-sm font-semibold">{parent.name}</p>
                            {parent.isDefault && <span className="text-[10px] text-gray-500 font-medium">Default Category</span>}
                          </div>
                        </button>

                        {/* Child Categories */}
                        {children.map(child => {
                          const ChildIcon = CategoryIconMap[child.icon || 'Folder'] || Folder;
                          return (
                            <button
                              key={child.id}
                              onClick={() => handleBulkMove(child.id)}
                              className="w-full pl-12 pr-5 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 active:bg-white/10 transition-colors group"
                            >
                              <div className="text-gray-600 self-center mr-1 text-xs">└─</div>
                              <div 
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ backgroundColor: `${child.color}15`, color: child.color }}
                              >
                                <ChildIcon className="w-4 h-4" />
                              </div>
                              <p className="text-gray-300 text-sm font-medium">{child.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-[#121b33] flex justify-end">
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav ──────────────────────────────────────────────── */}
      {!isSelectionMode && <BottomNav active={activeTab} onChange={setActiveTab} />}
    </div>
  );
}
