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
  Sparkles,
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
} from 'lucide-react';
import {
  subscribeToCustomCategories,
  addCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  reorderCustomCategories,
  getVaultItems,
  addVaultChangeListener,
  type CustomCategory,
  type VaultItem
} from '../store';
import { toast } from 'sonner';

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
  const [reassignOption, setReassignOption] = useState<'none' | 'reassign'>('none');
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

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
    return categories.filter((c) => !c.parentCategoryId && !c.isDefault);
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
    if (cat.isDefault) {
      toast.error('Default system categories cannot be deleted');
      return;
    }

    const count = categoryStats[cat.id] || 0;
    setDeletingCategory(cat);
    
    // Set reassign target to first eligible category that is not this one
    const eligibleTargets = categories.filter((c) => c.id !== cat.id && !c.isDefault);
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
      const reassignId = reassignOption === 'reassign' ? reassignTargetId : undefined;
      await deleteCustomCategory(deletingCategory.id, reassignId);
      toast.success('Category deleted successfully');
      setDeletingCategory(null);
    } catch (e) {
      toast.error('Failed to delete category');
    }
  };

  // Move category sortOrder
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const flatList = hierarchicalCategories.map(h => h.category);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === flatList.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const targetIds = [...flatList.map(c => c.id)];
    
    // Swap IDs
    const temp = targetIds[index];
    targetIds[index] = targetIds[newIndex];
    targetIds[newIndex] = temp;

    try {
      await reorderCustomCategories(targetIds);
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
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
              aria-label="Open menu"
            >
              <AlignJustify className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-white text-xl font-semibold">Manage Categories</h1>
              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center ml-1"
              title={user?.email ?? 'Signed in'}
            >
              <span className="text-white text-sm font-bold">{userInitial}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(env(safe-area-inset-bottom),_80px)] space-y-5">
        
        {/* Toggleable Beautiful Category Creator Section */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-4 px-4 bg-gradient-to-r from-purple-600/10 to-blue-600/10 hover:from-purple-600/20 hover:to-blue-600/20 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl flex items-center justify-center gap-2.5 text-purple-300 hover:text-purple-200 transition-all font-medium text-sm shadow-lg shadow-purple-950/20 shrink-0"
          >
            <Plus className="w-5 h-5" />
            Create Custom Category
          </button>
        ) : (
          <form
            onSubmit={handleAddCategory}
            className="bg-[#16213e]/60 border border-white/5 rounded-2xl p-5 space-y-4 shrink-0 transition-all shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
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
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-950/20"
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Colored Icon */}
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                            style={{ backgroundColor: `${cat.color || '#3b82f6'}20`, color: cat.color || '#3b82f6' }}
                          >
                            <IconComp className="w-5 h-5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm font-semibold truncate">{cat.name}</span>
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
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="bg-white/5 text-gray-300 text-xs px-2.5 py-1 rounded-lg font-bold min-w-[28px] text-center shadow-inner">
                            {itemCount}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Reorder Up */}
                            <button
                              onClick={() => handleMove(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-all"
                              title="Move Up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>

                            {/* Reorder Down */}
                            <button
                              onClick={() => handleMove(idx, 'down')}
                              disabled={idx === hierarchicalCategories.length - 1}
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
                            <button
                              onClick={(e) => startEditing(cat, e)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                              title="Edit Category"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {/* Delete Button */}
                            {!cat.isDefault && (
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
              Before deleting this category, you can choose to move all of its items to another category, or let them remain uncategorized.
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
              {categories.filter((c) => c.id !== deletingCategory.id && !c.isDefault).length > 0 && (
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
                        .filter((c) => c.id !== deletingCategory.id && !c.isDefault)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  )}
                </label>
              )}
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
    </div>
  );
}
