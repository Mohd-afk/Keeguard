import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { CustomCategory } from '../store';
import {
  Shield,
  Clock,
  Users,
  CreditCard,
  FileText,
  IdCard,
  Tag,
  Pencil,
  AlarmClock,
  BookTemplate,
  Trash2,
  Settings,
  X,
  ChevronRight,
} from 'lucide-react';
import type { VaultItem } from '../store';
import { CategoryIconMap } from './ManageCategories';

export type SidebarFilter =
  | 'all'
  | 'codes'
  | 'passkeys'
  | 'cards'
  | 'notes'
  | 'ids'
  | 'expiring'
  | 'templates'
  | 'trash'
  | string;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeFilter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  items: VaultItem[];
  customCategories: CustomCategory[];
  onNavigateSettings: () => void;
}

function SidebarRow({
  icon,
  label,
  count,
  active,
  onClick,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  chevron?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active
          ? 'bg-cyan-500/15 text-cyan-400'
          : 'text-gray-300 hover:bg-white/5 active:bg-white/10'
      }`}
    >
      {chevron}
      <span className={`shrink-0 ${active ? 'text-cyan-400' : 'text-gray-400'}`}>
        {icon}
      </span>
      <span className="flex-1 text-left font-medium text-sm">{label}</span>
      {count !== undefined && (
        <span className={`text-sm tabular-nums ${active ? 'text-cyan-400' : 'text-gray-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  open,
  onClose,
  activeFilter,
  onFilterChange,
  items,
  customCategories,
  onNavigateSettings,
}: SidebarProps) {
  const navigate = useNavigate();

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleParent = (parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const activeItems = items.filter((i) => !i.deletedAt);
  const trashedItems = items.filter((i) => !!i.deletedAt);

  const hierarchicalCategories = useMemo(() => {
    const visibleCats = customCategories.filter((c) => !c.isHidden);
    const parents = visibleCats.filter((c) => !c.parentCategoryId);
    const orphans = visibleCats.filter(
      (c) => c.parentCategoryId && !visibleCats.some((p) => p.id === c.parentCategoryId)
    );

    return [
      ...parents.map((parent) => ({
        parent,
        children: visibleCats.filter((c) => c.parentCategoryId === parent.id),
      })),
      ...orphans.map((orphan) => ({
        parent: orphan,
        children: [],
      })),
    ];
  }, [customCategories]);

  const select = (f: SidebarFilter) => {
    onFilterChange(f);
    onClose();
  };

  // Lock scroll when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[300px] max-w-[85vw] bg-[#16213e] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),_16px)] pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-lg">Safe</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNavigateSettings}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto pt-2 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)]">
          {/* All */}
          <div className="px-2 mb-1">
            <SidebarRow
              icon={<Shield className="w-5 h-5" />}
              label="All"
              count={activeItems.length}
              active={activeFilter === 'all'}
              onClick={() => select('all')}
            />
          </div>

          {/* Shared Vaults */}
          <div className="px-2 mb-1">
            <SidebarRow
              icon={<Users className="w-5 h-5 text-cyan-400" />}
              label="Shared Vaults"
              active={false}
              onClick={() => {
                onClose();
                navigate('/collections');
              }}
            />
          </div>

            {/* Custom Categories */}
            <div className="px-2 space-y-0.5">
              {hierarchicalCategories.map(({ parent, children }) => {
                const ParentIcon = CategoryIconMap[parent.icon || 'Folder'] || Tag;
              const isExpanded = !collapsedCategories.has(parent.id);
              const hasChildren = children.length > 0;

              return (
                <div key={`parent-group-${parent.id}`} className="space-y-0.5">
                  <SidebarRow
                    icon={<ParentIcon className="w-5 h-5" style={{ color: parent.color || '#3b82f6' }} />}
                    label={parent.name}
                    count={activeItems.filter((i) => i.categoryId === parent.id).length}
                    active={activeFilter === `category-${parent.id}`}
                    onClick={() => select(`category-${parent.id}`)}
                    chevron={
                      hasChildren ? (
                        <button
                          onClick={(e) => toggleParent(parent.id, e)}
                          className="p-1 -ml-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              isExpanded ? 'rotate-90' : 'rotate-0'
                            }`}
                          />
                        </button>
                      ) : null
                    }
                  />

                  {/* Children container with smooth transition */}
                  <div
                    className={`overflow-hidden transition-all duration-150 ease-in-out pl-4 border-l border-white/5 ml-5 space-y-0.5`}
                    style={{
                      maxHeight: isExpanded ? `${children.length * 48}px` : '0px',
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    {children.map((child) => {
                      const ChildIcon = CategoryIconMap[child.icon || 'Folder'] || Tag;
                      return (
                        <SidebarRow
                          key={`category-${child.id}`}
                          icon={<ChildIcon className="w-5 h-5" style={{ color: child.color || '#3b82f6' }} />}
                          label={child.name}
                          count={activeItems.filter((i) => i.categoryId === child.id).length}
                          active={activeFilter === `category-${child.id}`}
                          onClick={() => select(`category-${child.id}`)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <SidebarRow
              icon={<Pencil className="w-5 h-5" />}
              label="Manage categories"
              active={false}
              onClick={() => {
                onClose();
                navigate('/categories');
              }}
            />
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-white/5" />

          {/* System */}
          <div className="px-4 py-2">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">System</p>
          </div>
          <div className="px-2 space-y-0.5">
            <SidebarRow
              icon={<AlarmClock className="w-5 h-5" />}
              label="Expiring"
              count={0}
              active={activeFilter === 'expiring'}
              onClick={() => select('expiring')}
            />
            <SidebarRow
              icon={<BookTemplate className="w-5 h-5" />}
              label="Templates"
              count={0}
              active={activeFilter === 'templates'}
              onClick={() => select('templates')}
            />
            <SidebarRow
              icon={<Trash2 className="w-5 h-5" />}
              label="Recycle Bin"
              count={trashedItems.length}
              active={activeFilter === 'trash'}
              onClick={() => select('trash')}
            />
          </div>
        </div>
      </div>
    </>
  );
}
