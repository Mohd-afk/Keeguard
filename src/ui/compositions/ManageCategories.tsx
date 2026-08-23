import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import {
  AlignJustify,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  Pin,
  Folder,
  Tag,
  HelpCircle,
  KeyRound,
  Mail,
  Globe,
  Heart,
  Gamepad2,
  Fingerprint,
  IdCard,
  Briefcase,
  CreditCard,
  Wallet,
  Shield,
  Server,
  Code,
  User,
  Wifi,
  FileText,
  Tv,
  Lock,
  Laptop,
  Key,
  ShoppingBag,
  AppWindow,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  subscribeToCustomCategories,
  addCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  reorderCustomCategories,
  getVaultItems,
  addVaultChangeListener,
  updateVaultItem,
  deleteVaultItem,
  type CustomCategory,
  type VaultItem
} from '@/app/store';
import { toast } from 'sonner';
import { SmartCategorizer, type OrganizationPlan } from '@/app/services/SmartCategorizer';

// Curated static icon map for premium category icons
export const CategoryIconMap: Record<string, React.ComponentType<any>> = {
  KeyRound,
  Mail,
  Globe,
  Heart,
  Gamepad2,
  Fingerprint,
  IdCard,
  Briefcase,
  CreditCard,
  Wallet,
  Shield,
  Server,
  Code,
  User,
  Wifi,
  FileText,
  Tv,
  Lock,
  Laptop,
  Key,
  ShoppingBag,
  AppWindow,
  Folder,
  Tag,
};

const AVAILABLE_COLORS = [
  '#3b82f6', // Sapphire Blue
  '#10b981', // Emerald Green
  '#f59e0b', // Amber Gold
  '#ec4899', // Hot Pink
  '#8b5cf6', // Amethyst Violet
  '#06b6d4', // Cyan Blue
  '#6366f1', // Indigo Purple
  '#f97316', // Vibrant Orange
  '#ef4444', // Ruby Red
  '#64748b', // Slate Gray
];

const SMART_LOADING_MESSAGES = [
  { icon: '🔍', text: 'Scanning vault metadata...' },
  { icon: '🧠', text: 'Extracting domain signals...' },
  { icon: '⚡', text: 'Running multi-signal scoring engine...' },
  { icon: '🏷️', text: 'Matching against category rules...' },
  { icon: '🔗', text: 'Detecting duplicate clusters...' },
  { icon: '📊', text: 'Calculating confidence scores...' },
  { icon: '✨', text: 'Generating smart proposals...' },
  { icon: '🎯', text: 'Finalizing organization plan...' },
];

function SmartOrganizerLoadingUI({ progress }: { progress: { current: number; total: number; label: string } | null }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % SMART_LOADING_MESSAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;

  const msg = SMART_LOADING_MESSAGES[msgIdx];

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 gap-6">
      {/* Animated icon ring */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
        <div
          className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent animate-spin"
          style={{ animationDuration: '1.2s' }}
        />
        <div
          className="absolute inset-2 rounded-full border border-teal-500/30 border-t-teal-300 border-r-transparent border-b-transparent border-l-transparent animate-spin"
          style={{ animationDuration: '2s', animationDirection: 'reverse' }}
        />
        <span className="text-2xl" style={{ animation: 'none' }}>{msg.icon}</span>
      </div>

      {/* Cycling status message */}
      <div className="text-center space-y-1">
        <p className="text-cyan-300 text-sm font-semibold transition-all duration-500">{msg.text}</p>
        <p className="text-gray-500 text-xs">AI-powered multi-signal analysis</p>
      </div>

      {/* Progress bar (when we have item-level data) */}
      {progress && progress.total > 0 ? (
        <div className="w-full max-w-xs space-y-2">
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-[10px] truncate max-w-[180px]">
              {progress.label}
            </p>
            <p className="text-cyan-400 text-[10px] font-bold shrink-0 ml-2">
              {progress.current}/{progress.total}
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xs">
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full animate-pulse"
              style={{ width: '60%', animation: 'indeterminate 1.5s ease-in-out infinite' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManageCategories() {

  const navigate = useNavigate();
  const { setSidebarOpen, user } = useOutletContext<{
    setSidebarOpen: (o: boolean) => void;
    user: any;
  }>();

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [items, setItems] = useState<VaultItem[]>(getVaultItems());
  
  // Creation Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0]);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);

  // Editing State
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Folder');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [editParentId, setEditParentId] = useState<string | null>(null);

  // Deletion Modal / Confirm State
  const [deletingCategory, setDeletingCategory] = useState<CustomCategory | null>(null);
  const [reassignOption, setReassignOption] = useState<'none' | 'reassign' | 'deleteItems'>('none');
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  // Smart Categorizer State
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [smartPlan, setSmartPlan] = useState<OrganizationPlan | null>(null);
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [isApplyingSmart, setIsApplyingSmart] = useState(false);
  const [smartProgress, setSmartProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  // Subscribe to changes
  useEffect(() => {
    const unsubCategories = subscribeToCustomCategories((cats) => {
      setCategories([...cats]);
    });
    const unsubVault = addVaultChangeListener((updatedItems) => {
      setItems([...updatedItems]);
    });

    return () => {
      unsubCategories();
      unsubVault();
    };
  }, []);

  // Compute stats: item counts per category (recursively including subcategories if desired)
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    
    // Initialize stats
    categories.forEach((cat) => {
      stats[cat.id] = 0;
    });

    // Count direct items
    items.forEach((item) => {
      if (item.categoryId && stats[item.categoryId] !== undefined) {
        stats[item.categoryId]++;
      }
    });

    // Add subcategory counts to parent categories
    categories.forEach((cat) => {
      if (cat.parentCategoryId && stats[cat.parentCategoryId] !== undefined) {
        stats[cat.parentCategoryId] += stats[cat.id];
      }
    });

    return stats;
  }, [categories, items]);

  // Hierarchical list of categories (Parent categories with their children nested directly below)
  const hierarchicalCategories = useMemo(() => {
    const parents = categories.filter((c) => !c.parentCategoryId);
    const result: { category: CustomCategory; isChild: boolean }[] = [];

    parents.forEach((parent) => {
      result.push({ category: parent, isChild: false });
      // Find subcategories belonging to this parent
      const children = categories.filter((c) => c.parentCategoryId === parent.id);
      children.forEach((child) => {
        result.push({ category: child, isChild: true });
      });
    });

    // Also collect orphan subcategories (if any parent got deleted)
    categories.forEach((cat) => {
      if (cat.parentCategoryId && !categories.some((p) => p.id === cat.parentCategoryId)) {
        result.push({ category: cat, isChild: true });
      }
    });

    return result;
  }, [categories]);

  // Pinned categories
  const pinnedCategoriesCount = useMemo(() => {
    return categories.filter((c) => c.isPinned).length;
  }, [categories]);

  // List of eligible parents for form picker (cannot nest a child inside another child, only 1 level deep)
  const eligibleParents = useMemo(() => {
    return categories.filter((c) => !c.parentCategoryId);
  }, [categories]);

  // Handle Save Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      await addCustomCategory({
        name: name.trim(),
        icon: selectedIcon,
        color: selectedColor,
        isDefault: false,
        isHidden: false,
        isPinned: false,
        parentCategoryId: parentCategoryId || null,
        sortOrder: categories.length,
      });

      toast.success('Category created successfully');
      setName('');
      setSelectedIcon('Folder');
      setSelectedColor(AVAILABLE_COLORS[0]);
      setParentCategoryId(null);
      setShowAddForm(false);
    } catch (e) {
      toast.error('Failed to create category');
    }
  };

  // Toggle Pinned status
  const handleTogglePin = async (cat: CustomCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateCustomCategory(cat.id, { isPinned: !cat.isPinned });
      toast.success(cat.isPinned ? 'Category unpinned' : 'Category pinned to top');
    } catch (e) {
      toast.error('Failed to update category pin status');
    }
  };

  // Toggle Hidden status
  const handleToggleHide = async (cat: CustomCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateCustomCategory(cat.id, { isHidden: !cat.isHidden });
      toast.success(cat.isHidden ? 'Category visible on main screen' : 'Category hidden from main screen');
    } catch (e) {
      toast.error('Failed to update category visibility');
    }
  };

  // Inline rename / edit modal launcher
  const startEditing = (cat: CustomCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (cat.id === 'default_passwords' || cat.name === 'Passwords') {
      toast.error('The Passwords root category is locked and cannot be modified');
      return;
    }
    setEditingCategoryId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon || 'Folder');
    setEditColor(cat.color || '#3b82f6');
    setEditParentId(cat.parentCategoryId || null);
  };

  const handleUpdateCategory = async () => {
    if (!editName.trim()) {
      toast.error('Category name is required');
      return;
    }
    if (editingCategoryId === editParentId) {
      toast.error('Category cannot be its own parent');
      return;
    }

    try {
      await updateCustomCategory(editingCategoryId!, {
        name: editName.trim(),
        icon: editIcon,
        color: editColor,
        parentCategoryId: editParentId || null,
      });
      toast.success('Category updated successfully');
      setEditingCategoryId(null);
    } catch (e) {
      toast.error('Failed to update category');
    }
  };

  // Delete category verification
  const startDeleteCategory = (cat: CustomCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (cat.id === 'default_passwords' || cat.name === 'Passwords') {
      toast.error('The Passwords root category is locked and cannot be deleted');
      return;
    }

    const count = categoryStats[cat.id] || 0;
    setDeletingCategory(cat);
    
    // Set reassign target to first eligible category that is not this one
    const eligibleTargets = categories.filter((c) => c.id !== cat.id);
    if (eligibleTargets.length > 0) {
      setReassignTargetId(eligibleTargets[0].id);
      setReassignOption('reassign');
    } else {
      setReassignOption('none');
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deletingCategory) return;

    try {
      if (reassignOption === 'deleteItems') {
        const itemsToDelete = items.filter(item => item.categoryId === deletingCategory.id);
        for (const item of itemsToDelete) {
          await deleteVaultItem(item.id);
        }
        await deleteCustomCategory(deletingCategory.id, undefined);
      } else {
        const reassignId = reassignOption === 'reassign' ? reassignTargetId : undefined;
        await deleteCustomCategory(deletingCategory.id, reassignId);
      }
      toast.success('Category and data updated successfully');
      setDeletingCategory(null);
    } catch (e) {
      toast.error('Failed to delete category');
    }
  };

  // Move category sortOrder
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetCat = hierarchicalCategories[index].category;
    const parentId = targetCat.parentCategoryId;
    
    // Get all siblings (same parent level)
    const siblings = categories
      .filter(c => c.parentCategoryId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      
    const siblingIndex = siblings.findIndex(c => c.id === targetCat.id);
    if (siblingIndex === -1) return;
    
    if (direction === 'up' && siblingIndex === 0) return;
    if (direction === 'down' && siblingIndex === siblings.length - 1) return;
    
    const swapWithSibling = siblings[direction === 'up' ? siblingIndex - 1 : siblingIndex + 1];
    
    try {
      const currentOrder = targetCat.sortOrder ?? 0;
      const swapOrder = swapWithSibling.sortOrder ?? 0;
      
      await updateCustomCategory(targetCat.id, { sortOrder: swapOrder });
      await updateCustomCategory(swapWithSibling.id, { sortOrder: currentOrder });
      
      toast.success('Category reordered');
    } catch (e) {
      toast.error('Failed to reorder categories');
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col select-none">
      {/* Premium Sticky Safe Top Bar */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_0px)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors md:hidden"
              aria-label="Open menu"
            >
              <AlignJustify className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-white text-xl font-semibold">Manage Categories</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center ml-1"
              title={user?.email ?? 'Signed in'}
            >
              <span className="text-white text-sm font-bold">{userInitial}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(env(safe-area-inset-bottom),_80px)] space-y-5">
        <div className="max-w-4xl mx-auto w-full space-y-5">
        {/* Toggleable Beautiful Category Creator Section */}
        <div className="flex gap-3">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex-1 py-4 px-4 bg-gradient-to-r from-purple-600/10 to-blue-600/10 hover:from-purple-600/20 hover:to-blue-600/20 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl flex items-center justify-center gap-2.5 text-purple-300 hover:text-purple-200 transition-all font-medium text-sm shadow-md shrink-0"
            >
              <Plus className="w-5 h-5" />
              Create Category
            </button>
          )}

          {!showAddForm && (
            <button
              onClick={async () => {
                setIsSmartLoading(true);
                setSmartPlan(null);
                setSmartProgress(null);
                setShowSmartModal(true);
                try {
                  const plan = await SmartCategorizer.planVaultOrganization(items, {
                    categoriesArray: categories,
                    onProgress: (current, total, label) => {
                      setSmartProgress({ current, total, label });
                    }
                  });
                  setSmartPlan(plan);
                } catch (e) {
                  toast.error("Failed to generate smart plan");
                } finally {
                  setIsSmartLoading(false);
                  setSmartProgress(null);
                }
              }}
              className="flex-1 py-4 px-4 bg-gradient-to-r from-cyan-600/10 to-teal-600/10 hover:from-cyan-600/20 hover:to-teal-600/20 border border-cyan-500/20 hover:border-cyan-500/40 rounded-2xl flex items-center justify-center gap-2.5 text-cyan-300 hover:text-cyan-200 transition-all font-medium text-sm shadow-md shrink-0"
            >
              <Sparkles className="w-5 h-5" />
              Auto-Organize
            </button>
          )}
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddCategory}
            className="bg-[#16213e]/60 border border-white/5 rounded-2xl p-5 space-y-4 shrink-0 transition-all shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                New Custom Category
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Name */}
            <div className="space-y-1.5">
              <label className="text-gray-400 text-xs font-medium">Category Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Social, Banking, Work"
                className="w-full bg-[#0a0a14] border border-white/5 focus:border-purple-500/50 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                maxLength={30}
              />
            </div>

            {/* Parent Category Picker (for Nested hierarchy) */}
            <div className="space-y-1.5">
              <label className="text-gray-400 text-xs font-medium flex items-center gap-1.5">
                Parent Category (Optional)
                <span title="Link as a subcategory under a parent category">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
                </span>
              </label>
              <select
                value={parentCategoryId || ''}
                onChange={(e) => setParentCategoryId(e.target.value || null)}
                className="w-full bg-[#0a0a14] border border-white/5 focus:border-purple-500/50 rounded-xl px-3 py-3 text-white text-sm focus:outline-none transition-colors"
              >
                <option value="">None (Top-Level Category)</option>
                {eligibleParents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Premium Icon Picker */}
            <div className="space-y-2">
              <label className="text-gray-400 text-xs font-medium">Select Custom Icon</label>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 p-2 bg-[#0a0a14]/60 border border-white/5 rounded-xl max-h-36 overflow-y-auto">
                {Object.keys(CategoryIconMap).map((iconKey) => {
                  const IconComp = CategoryIconMap[iconKey];
                  const isSelected = selectedIcon === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setSelectedIcon(iconKey)}
                      className={`aspect-square flex items-center justify-center rounded-lg transition-all ${
                        isSelected
                          ? 'bg-purple-600 text-white scale-105 shadow-md shadow-purple-600/30'
                          : 'bg-[#1a1a2e] text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <IconComp className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Color Picker */}
            <div className="space-y-2">
              <label className="text-gray-400 text-xs font-medium">Select Theme Color</label>
              <div className="flex flex-wrap gap-2.5">
                {AVAILABLE_COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'ring-4 ring-purple-500/40 ring-offset-2 ring-offset-[#16213e] scale-110'
                          : 'hover:scale-105'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <button
              type="submit"
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              <Check className="w-4 h-4" />
              Save Category
            </button>
          </form>
        )}

        {/* Categories List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold px-2 uppercase tracking-wider shrink-0">
            <span>Structure & Order</span>
            <span>Items</span>
          </div>

          <div className="space-y-2">
            {hierarchicalCategories.length === 0 ? (
              <div className="bg-[#16213e]/20 border border-white/5 rounded-2xl py-10 px-4 text-center shrink-0">
                <p className="text-gray-400 text-sm">No custom categories created yet.</p>
                <p className="text-gray-500 text-xs mt-1">Default categories are initialized for organizing items.</p>
              </div>
            ) : (
              hierarchicalCategories.map((hc, idx) => {
                const cat = hc.category;
                const isChild = hc.isChild;
                const isEditing = editingCategoryId === cat.id;
                const IconComp = CategoryIconMap[cat.icon || 'Folder'] || Folder;
                const itemCount = categoryStats[cat.id] || 0;

                const parentId = cat.parentCategoryId;
                const siblings = categories
                  .filter(c => c.parentCategoryId === parentId)
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                const siblingIdx = siblings.findIndex(c => c.id === cat.id);
                const isFirstSibling = siblingIdx === 0;
                const isLastSibling = siblingIdx === siblings.length - 1;

                return (
                  <div
                    key={cat.id}
                    className={`bg-[#16213e]/40 border ${
                      isEditing ? 'border-purple-500/40 bg-[#16213e]/70' : 'border-white/5'
                    } rounded-xl p-3 flex flex-col gap-3 transition-all ${
                      cat.isHidden ? 'opacity-50' : ''
                    } ${isChild ? 'ml-6 relative border-l-2 border-l-purple-500/20 pl-4' : ''}`}
                  >
                    
                    {/* Visual Branch Line for Children */}
                    {isChild && (
                      <div className="absolute left-[-16px] top-0 bottom-1/2 w-3.5 border-b-2 border-l-2 border-purple-500/20 rounded-bl-lg pointer-events-none" />
                    )}

                    {/* Standard Mode view or Inline Edit view */}
                    {!isEditing ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Colored Icon */}
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                            style={{ backgroundColor: `${cat.color || '#3b82f6'}20`, color: cat.color || '#3b82f6' }}
                          >
                            <IconComp className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white text-sm font-semibold truncate max-w-[120px] sm:max-w-none">{cat.name}</span>
                              {(cat.id === 'default_passwords' || cat.name === 'Passwords') && (
                                <Lock className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              )}
                              {cat.isPinned && (
                                <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400 rotate-45 shrink-0" />
                              )}
                              {cat.isDefault && (
                                <span className="bg-white/5 text-gray-400 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                                  Default
                                </span>
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-500 mt-0.5">
                              {isChild ? 'Subcategory' : 'Top-Level'}
                              {cat.isHidden && ' • Hidden'}
                            </p>
                          </div>
                        </div>

                        {/* Right Section: Counter + Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0 flex-1 sm:flex-none">
                          <span className="bg-white/5 text-gray-300 text-xs px-2.5 py-1 rounded-lg font-bold min-w-[28px] text-center shadow-inner">
                            {itemCount}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Reorder Up */}
                            <button
                              onClick={() => handleMove(idx, 'up')}
                              disabled={isFirstSibling}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-all"
                              title="Move Up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>

                            {/* Reorder Down */}
                            <button
                              onClick={() => handleMove(idx, 'down')}
                              disabled={isLastSibling}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-all"
                              title="Move Down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>

                            {/* Toggle Pin */}
                            <button
                              onClick={(e) => handleTogglePin(cat, e)}
                              className={`p-1.5 rounded-lg transition-all ${
                                cat.isPinned ? 'text-amber-400 hover:text-amber-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
                              }`}
                              title={cat.isPinned ? 'Unpin from Top' : 'Pin to Top'}
                            >
                              <Pin className={`w-4 h-4 ${cat.isPinned ? 'fill-amber-400 rotate-45' : ''}`} />
                            </button>

                            {/* Toggle Hide */}
                            <button
                              onClick={(e) => handleToggleHide(cat, e)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                              title={cat.isHidden ? 'Show on Main View' : 'Hide from Main View'}
                            >
                              {cat.isHidden ? <EyeOff className="w-4 h-4 text-purple-400" /> : <Eye className="w-4 h-4" />}
                            </button>

                            {/* Edit Button */}
                            {(cat.id !== 'default_passwords' && cat.name !== 'Passwords') ? (
                              <button
                                onClick={(e) => startEditing(cat, e)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                                title="Edit Category"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="p-1.5 text-gray-600 cursor-not-allowed" title="Locked category">
                                <Edit2 className="w-4 h-4 opacity-30" />
                              </div>
                            )}

                            {/* Delete Button */}
                            {(cat.id !== 'default_passwords' && cat.name !== 'Passwords') && (
                              <button
                                onClick={(e) => startDeleteCategory(cat, e)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
                                title="Delete Category"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Inline Editing Mode View
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-white text-xs font-semibold">Editing Category</h4>
                          <button
                            onClick={() => setEditingCategoryId(null)}
                            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Name Input */}
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-[#0a0a14] border border-purple-500/30 focus:border-purple-500/70 rounded-lg px-3 py-2 text-white text-sm"
                            placeholder="Category Name"
                          />
                        </div>

                        {/* Parent Select */}
                        {!cat.isDefault && (
                          <div className="space-y-1">
                            <label className="text-gray-400 text-[10px]">Parent Category</label>
                            <select
                              value={editParentId || ''}
                              onChange={(e) => setEditParentId(e.target.value || null)}
                              className="w-full bg-[#0a0a14] border border-white/5 rounded-lg px-2 py-2 text-white text-xs"
                            >
                              <option value="">None (Top-Level)</option>
                              {eligibleParents
                                .filter((p) => p.id !== cat.id) // cannot parent to self
                                .map((parent) => (
                                  <option key={parent.id} value={parent.id}>
                                    {parent.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        {/* Edit Icon Grid */}
                        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-2 bg-[#0a0a14]/60 border border-white/5 rounded-lg max-h-24 overflow-y-auto">
                          {Object.keys(CategoryIconMap).map((iconKey) => {
                            const IconComp = CategoryIconMap[iconKey];
                            const isSelected = editIcon === iconKey;
                            return (
                              <button
                                key={iconKey}
                                type="button"
                                onClick={() => setEditIcon(iconKey)}
                                className={`aspect-square flex items-center justify-center rounded-lg transition-all ${
                                  isSelected ? 'bg-purple-600 text-white' : 'bg-[#1a1a2e] text-gray-400 hover:text-white'
                                }`}
                              >
                                <IconComp className="w-4.5 h-4.5" />
                              </button>
                            );
                          })}
                        </div>

                        {/* Edit Color Palette */}
                        <div className="flex flex-wrap gap-2">
                          {AVAILABLE_COLORS.map((color) => {
                            const isSelected = editColor === color;
                            return (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setEditColor(color)}
                                style={{ backgroundColor: color }}
                                className={`w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all ${
                                  isSelected ? 'ring-2 ring-purple-500 scale-105' : 'hover:scale-105'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              </button>
                            );
                          })}
                        </div>

                        {/* Save Changes Button */}
                        <button
                          onClick={handleUpdateCategory}
                          className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Update Category
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Elegant Deletion & Reassignment Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-[#0a0a14]/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16213e] border border-white/10 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Delete Category?</h3>
                <p className="text-gray-400 text-xs">"{deletingCategory.name}" contains {categoryStats[deletingCategory.id] || 0} items</p>
              </div>
            </div>

            <p className="text-gray-300 text-xs leading-relaxed">
              Before deleting this category, you can choose to move all of its items to another category, remain them uncategorized, or delete them along with the category.
            </p>

            <div className="space-y-3 pt-1">
              {/* Option 1: Uncategorized */}
              <label className="flex items-center gap-3 p-3 bg-[#0a0a14]/40 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <input
                  type="radio"
                  name="deleteOption"
                  checked={reassignOption === 'none'}
                  onChange={() => setReassignOption('none')}
                  className="accent-purple-500 w-4 h-4 shrink-0"
                />
                <div>
                  <span className="text-white text-xs font-semibold">Make items uncategorized</span>
                  <p className="text-gray-500 text-[10px] mt-0.5">Removes category tags; passwords remain safe.</p>
                </div>
              </label>

              {/* Option 2: Reassign Category */}
              {categories.filter((c) => c.id !== deletingCategory.id).length > 0 && (
                <label className="flex items-col gap-3 p-3 bg-[#0a0a14]/40 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                  <div className="flex items-center gap-3 w-full">
                    <input
                      type="radio"
                      name="deleteOption"
                      checked={reassignOption === 'reassign'}
                      onChange={() => setReassignOption('reassign')}
                      className="accent-purple-500 w-4 h-4 shrink-0"
                    />
                    <div className="flex-1">
                      <span className="text-white text-xs font-semibold">Move items to another category</span>
                      <p className="text-gray-500 text-[10px] mt-0.5">Reassigns items instantly to a chosen group.</p>
                    </div>
                  </div>

                  {reassignOption === 'reassign' && (
                    <select
                      value={reassignTargetId}
                      onChange={(e) => setReassignTargetId(e.target.value)}
                      className="w-full mt-2.5 bg-[#16213e] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                    >
                      {categories
                        .filter((c) => c.id !== deletingCategory.id)
                        .map((c) => (
                           <option key={c.id} value={c.id}>
                             {c.name}
                           </option>
                        ))}
                    </select>
                  )}
                </label>
              )}

              {/* Option 3: Delete Category and all items */}
              <label className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl cursor-pointer hover:bg-red-500/15 transition-all">
                <input
                  type="radio"
                  name="deleteOption"
                  checked={reassignOption === 'deleteItems'}
                  onChange={() => setReassignOption('deleteItems')}
                  className="accent-red-500 w-4 h-4 shrink-0"
                />
                <div>
                  <span className="text-red-400 text-xs font-semibold">Delete category and all its passwords</span>
                  <p className="text-red-500/70 text-[10px] mt-0.5">Moves all category items to recycle bin automatically.</p>
                </div>
              </label>
            </div>

            {/* Confirmation Controls */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeletingCategory(null)}
                className="flex-1 py-2.5 bg-[#0a0a14]/60 hover:bg-[#0a0a14] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-red-950/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Auto-Organize Modal */}
      {showSmartModal && (
        <div className="fixed inset-0 z-50 bg-[#0a0a14]/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16213e] border border-white/10 rounded-2xl w-full max-w-2xl p-5 shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3 text-cyan-400">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-base">Smart Categorizer</h3>
                  <p className="text-gray-400 text-xs">AI-powered vault organization</p>
                </div>
              </div>
              <button
                onClick={() => setShowSmartModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {isSmartLoading ? (
                <SmartOrganizerLoadingUI progress={smartProgress} />
              ) : !smartPlan || (smartPlan.itemProposals.length === 0 && smartPlan.newCategoryProposals.length === 0) ? (
                <div className="text-center py-10">
                  <p className="text-gray-400">Vault is optimally organized!</p>
                </div>
              ) : (
                <>
                  {smartPlan.newCategoryProposals.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-white text-sm font-semibold mb-2">Suggested New Categories</h4>
                      {smartPlan.newCategoryProposals.map((catProp, idx) => (
                        <div key={`cat-${idx}`} className="flex items-center justify-between p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={catProp.approved}
                              onChange={() => {
                                const newPlan = { ...smartPlan };
                                newPlan.newCategoryProposals[idx].approved = !newPlan.newCategoryProposals[idx].approved;
                                setSmartPlan(newPlan);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-transparent accent-cyan-500 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <p className="text-white text-sm font-medium flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                Create: {catProp.categoryName}
                              </p>
                              <p className="text-cyan-300/70 text-[10px]">{catProp.reason}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Auto-Apply Items Section */}
                  {(() => {
                    const autoApplyItems = smartPlan.itemProposals.filter(p => p.changeType !== 'none' && !p.needsReview && p.confidence >= 0.7);
                    if (autoApplyItems.length === 0) return null;
                    return (
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white text-sm font-semibold">Auto-Apply Suggestions</h4>
                          <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10">High Confidence</span>
                        </div>
                        {autoApplyItems.map((prop, idx) => (
                          <div key={`auto-${idx}`} className="flex items-center justify-between p-3 bg-[#0a0a14]/40 border border-white/5 rounded-xl">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={prop.approved}
                                onChange={() => {
                                  const newPlan = { ...smartPlan };
                                  const realIdx = newPlan.itemProposals.findIndex(p => p.itemId === prop.itemId);
                                  if (realIdx > -1) {
                                    newPlan.itemProposals[realIdx].approved = !newPlan.itemProposals[realIdx].approved;
                                    setSmartPlan(newPlan);
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-600 bg-transparent accent-cyan-500 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <p className="text-white text-sm font-medium truncate">{prop.title}</p>
                                <p className="text-gray-400 text-[10px] truncate">{prop.reason}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <div className="flex flex-col items-end">
                                <span className="text-emerald-400 text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 rounded-md truncate max-w-[120px]">
                                  {prop.proposedCategory}
                                </span>
                                <span className="text-gray-500 text-[9px] mt-0.5">
                                  {(prop.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Review Queue / Low Confidence Section */}
                  {(() => {
                    const reviewItems = smartPlan.itemProposals.filter(p => p.changeType !== 'none' && (p.needsReview || p.confidence < 0.7));
                    if (reviewItems.length === 0) return null;
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white text-sm font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            Needs Review Queue
                          </h4>
                          <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-500/10">Low Confidence / Vague</span>
                        </div>
                        {reviewItems.map((prop, idx) => {
                          // Assemble candidates: proposed (if not Uncategorized) + alternatives
                          const candidates: { category: string; confidence: number }[] = [];
                          if (prop.proposedCategory && prop.proposedCategory !== 'Uncategorized') {
                            candidates.push({ category: prop.proposedCategory, confidence: prop.confidence });
                          }
                          if (prop.alternatives) {
                            prop.alternatives.forEach(alt => {
                              if (!candidates.some(c => c.category === alt.category)) {
                                candidates.push({ category: alt.category, confidence: alt.confidence });
                              }
                            });
                          }
                          // Ensure we have fallback candidates if empty
                          const defaults = ['Banking & Finance', 'Social Media', 'Work & Productivity', 'Email & Communication'];
                          defaults.forEach(def => {
                            if (candidates.length < 3 && !candidates.some(c => c.category === def)) {
                              candidates.push({ category: def, confidence: 0.1 });
                            }
                          });

                          return (
                            <div key={`review-${idx}`} className="bg-amber-950/10 border border-amber-500/20 rounded-2xl p-4 space-y-3 shadow-lg relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/5 to-transparent pointer-events-none" />
                              
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-white text-sm font-bold truncate">{prop.title}</span>
                                    {prop.username && (
                                      <span className="text-gray-400 text-xs truncate max-w-[120px] bg-white/5 px-2 py-0.5 rounded-md">
                                        @{prop.username}
                                      </span>
                                    )}
                                    <span className="text-amber-300/90 text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded-full">
                                      Needs Review
                                    </span>
                                  </div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    {prop.evidence && prop.evidence.length > 0 ? prop.evidence.join(', ') : 'Vague or missing URL/metadata signals.'}
                                  </p>
                                </div>
                                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-1 rounded-lg select-none">
                                  Score: {(prop.confidence * 100).toFixed(0)}%
                                </span>
                              </div>

                              {/* Candidate pills */}
                              <div className="space-y-1.5 pt-1">
                                <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider block">One-Tap Quick Classify & Retrain AI:</span>
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                  {candidates.slice(0, 3).map((alt) => {
                                    const isChosen = prop.approved && prop.proposedCategory === alt.category;
                                    return (
                                      <button
                                        key={alt.category}
                                        type="button"
                                        onClick={() => {
                                          const newPlan = { ...smartPlan };
                                          const realIdx = newPlan.itemProposals.findIndex(p => p.itemId === prop.itemId);
                                          if (realIdx > -1) {
                                            newPlan.itemProposals[realIdx].proposedCategory = alt.category;
                                            newPlan.itemProposals[realIdx].confidence = alt.confidence;
                                            newPlan.itemProposals[realIdx].approved = true;
                                            newPlan.itemProposals[realIdx].needsReview = false;
                                            newPlan.itemProposals[realIdx].reason = `Manually reviewed: assigned ${alt.category}`;
                                            setSmartPlan(newPlan);
                                          }
                                          // Retrain learned store instantly
                                          SmartCategorizer.learnFromUserDecision({
                                            domain: prop.domain || prop.title,
                                            chosenCategory: alt.category
                                          });
                                          toast.success(`Classified as "${alt.category}" & trained smart model!`);
                                        }}
                                        className={`text-[10px] font-semibold rounded-full px-3 py-1.5 transition-all flex items-center gap-1 active:scale-95 border cursor-pointer ${
                                          isChosen
                                            ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-md shadow-cyan-500/20'
                                            : 'bg-[#16213e] hover:bg-cyan-950/40 hover:text-cyan-300 border-gray-700 text-gray-300 hover:border-cyan-500/50'
                                        }`}
                                      >
                                        <span>{alt.category}</span>
                                        <span className="opacity-70">({(alt.confidence * 100).toFixed(0)}%)</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {!isSmartLoading && smartPlan && (smartPlan.itemProposals.some(p => p.changeType !== 'none') || smartPlan.newCategoryProposals.length > 0) && (
              <div className="flex items-center gap-3 pt-4 border-t border-white/5 shrink-0">
                <button
                  onClick={() => setShowSmartModal(false)}
                  className="flex-1 py-2.5 bg-[#0a0a14]/60 hover:bg-[#0a0a14] border border-white/5 rounded-xl text-gray-400 hover:text-white text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={isApplyingSmart}
                  onClick={async () => {
                    setIsApplyingSmart(true);
                    let applyCount = 0;
                    try {
                      // 1. Create approved new categories and keep track of them (avoid stale state bugs)
                      const createdCats = [];
                      for (const catProp of smartPlan.newCategoryProposals) {
                        if (catProp.approved) {
                           const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#6366f1', '#f97316', '#ef4444', '#64748b'];
                           const randomColor = colors[Math.floor(Math.random() * colors.length)];
                           const newCat = await addCustomCategory({
                             name: catProp.categoryName,
                             icon: 'Folder',
                             color: randomColor,
                             isDefault: false,
                             isHidden: false,
                             isPinned: false,
                             parentCategoryId: null,
                             sortOrder: categories.length + createdCats.length,
                           });
                           createdCats.push(newCat);
                        }
                      }

                      // Combine existing categories with the newly created ones
                      const allCategories = [...categories, ...createdCats];

                      // 2. Apply item changes
                      for (const prop of smartPlan.itemProposals) {
                        if (prop.approved && prop.changeType !== 'none') {
                           // Find target category ID
                           const targetCat = allCategories.find(c => c.name.toLowerCase() === prop.proposedCategory.toLowerCase());
                           if (targetCat && prop.itemId) {
                              await updateVaultItem(prop.itemId, { categoryId: targetCat.id });
                              applyCount++;
                           }
                        }
                      }
                      toast.success(`Applied ${applyCount} item organizations!`);
                      setShowSmartModal(false);
                    } catch (e) {
                      console.error("Failed to apply smart organization:", e);
                      toast.error("Failed to apply all organizations");
                    } finally {
                      setIsApplyingSmart(false);
                    }
                  }}
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-950/20"
                >
                  {isApplyingSmart ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Apply Selected
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
