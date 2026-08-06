import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Plus,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  ChevronRight,
  LayoutList,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  User,
  CreditCard,
  FileText,
  Briefcase,
  Heart,
  Globe,
  Shield,
  Smartphone,
  Star,
  ClipboardList,
  Layers,
  ShoppingCart,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import {
  subscribeToFieldProfiles,
  addFieldProfile,
  updateFieldProfile,
  deleteFieldProfile,
  upsertFieldInProfile,
  deleteFieldFromProfile,
  reorderFieldsInProfile,
  type FieldProfile,
  type CustomField,
  type CustomFieldType,
} from '../store';
import { toast } from 'sonner';

// ── Icon Map ────────────────────────────────────────────────────────────
const ProfileIconMap: Record<string, React.ReactNode> = {
  User: <User className="w-5 h-5" />,
  CreditCard: <CreditCard className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  Briefcase: <Briefcase className="w-5 h-5" />,
  Heart: <Heart className="w-5 h-5" />,
  Globe: <Globe className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Smartphone: <Smartphone className="w-5 h-5" />,
  Star: <Star className="w-5 h-5" />,
  LayoutList: <LayoutList className="w-5 h-5" />,
};

const PROFILE_ICONS = Object.keys(ProfileIconMap);

const ACCENT_COLORS = [
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#10b981', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#6366f1', // indigo
  '#64748b', // slate
];

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  password: 'Password',
};

function generateFieldId(): string {
  return 'field_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
}

// ── Profile Presets ─────────────────────────────────────────────────────

export const PROFILE_PRESETS = [
  {
    id: 'ecommerce_seller',
    name: 'E-Commerce Seller',
    description: 'SKU, MRP, Selling Price, GST, Stock & Listing info',
    icon: 'ShoppingCart',
    color: '#f97316',
    fields: [
      { name: 'Seller SKU ID', type: 'text' as const, sensitive: false },
      { name: 'MRP', type: 'number' as const, sensitive: false },
      { name: 'Selling Price', type: 'number' as const, sensitive: false },
      { name: 'Listing Status', type: 'text' as const, sensitive: false },
      { name: 'Stock Quantity', type: 'number' as const, sensitive: false },
      { name: 'HSN Code', type: 'text' as const, sensitive: false },
      { name: 'GST %', type: 'number' as const, sensitive: false },
      { name: 'Category', type: 'text' as const, sensitive: false },
      { name: 'Brand', type: 'text' as const, sensitive: false },
    ],
  },
  {
    id: 'personal_id',
    name: 'Personal ID & Passport',
    description: 'Passport, Aadhaar/SSN, DOB, Issue & Expiry dates',
    icon: 'Shield',
    color: '#3b82f6',
    fields: [
      { name: 'Full Name', type: 'text' as const, sensitive: false },
      { name: 'Date of Birth', type: 'date' as const, sensitive: false },
      { name: 'Passport Number', type: 'text' as const, sensitive: true },
      { name: 'Nationality', type: 'text' as const, sensitive: false },
      { name: 'Issue Date', type: 'date' as const, sensitive: false },
      { name: 'Expiry Date', type: 'date' as const, sensitive: false },
      { name: 'Aadhaar / SSN', type: 'text' as const, sensitive: true },
      { name: 'Place of Birth', type: 'text' as const, sensitive: false },
    ],
  },
  {
    id: 'banking_finance',
    name: 'Banking & Finance',
    description: 'Account No, IFSC, UPI, PAN, Tax ID',
    icon: 'Wallet',
    color: '#f59e0b',
    fields: [
      { name: 'Bank Name', type: 'text' as const, sensitive: false },
      { name: 'Account Number', type: 'text' as const, sensitive: true },
      { name: 'IFSC Code', type: 'text' as const, sensitive: false },
      { name: 'UPI ID', type: 'text' as const, sensitive: false },
      { name: 'Branch', type: 'text' as const, sensitive: false },
      { name: 'PAN / Tax ID', type: 'text' as const, sensitive: true },
      { name: 'Account Type', type: 'text' as const, sensitive: false },
    ],
  },
  {
    id: 'job_application',
    name: 'Job Application',
    description: 'CTC, Notice Period, LinkedIn, Skills',
    icon: 'Briefcase',
    color: '#8b5cf6',
    fields: [
      { name: 'Current CTC', type: 'text' as const, sensitive: false },
      { name: 'Expected CTC', type: 'text' as const, sensitive: false },
      { name: 'Notice Period', type: 'text' as const, sensitive: false },
      { name: 'LinkedIn URL', type: 'url' as const, sensitive: false },
      { name: 'Portfolio URL', type: 'url' as const, sensitive: false },
      { name: 'Skills Summary', type: 'text' as const, sensitive: false },
      { name: 'Total Experience', type: 'text' as const, sensitive: false },
    ],
  },
  {
    id: 'medical_health',
    name: 'Medical / Health',
    description: 'Blood group, Allergies, Insurance, Doctor',
    icon: 'Stethoscope',
    color: '#ef4444',
    fields: [
      { name: 'Blood Group', type: 'text' as const, sensitive: false },
      { name: 'Allergies', type: 'text' as const, sensitive: false },
      { name: 'Emergency Contact', type: 'phone' as const, sensitive: false },
      { name: 'Insurance ID', type: 'text' as const, sensitive: true },
      { name: 'Insurance Provider', type: 'text' as const, sensitive: false },
      { name: 'Doctor Name', type: 'text' as const, sensitive: false },
      { name: 'Doctor Phone', type: 'phone' as const, sensitive: false },
      { name: 'Medical Notes', type: 'text' as const, sensitive: false },
    ],
  },
];

const PRESET_ICON_MAP: Record<string, React.ReactNode> = {
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Wallet: <Wallet className="w-5 h-5" />,
  Briefcase: <Briefcase className="w-5 h-5" />,
  Stethoscope: <Stethoscope className="w-5 h-5" />,
  User: <User className="w-5 h-5" />,
  Globe: <Globe className="w-5 h-5" />,
  LayoutList: <LayoutList className="w-5 h-5" />,
};

// ── Add/Edit Field Bottom Sheet ─────────────────────────────────────────

// ── Bulk Paste Import Sheet ──────────────────────────────────────────────

interface BulkImportSheetProps {
  onImport: (fields: CustomField[]) => void;
  onClose: () => void;
}

function BulkImportSheet({ onImport, onClose }: BulkImportSheetProps) {
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<Array<{ name: string; value: string }>>([]);

  const parseLines = (text: string) => {
    return text
      .split('\n')
      .map(line => {
        const idx = line.indexOf(':');
        if (idx === -1) return null;
        const name = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        return name ? { name, value } : null;
      })
      .filter(Boolean) as Array<{ name: string; value: string }>;
  };

  const handleChange = (text: string) => {
    setRaw(text);
    setPreview(parseLines(text));
  };

  const handleImport = () => {
    const pairs = parseLines(raw);
    if (pairs.length === 0) { toast.error('No valid fields found. Use "Field Name: Value" format.'); return; }
    const fields: CustomField[] = pairs.map(p => ({
      id: generateFieldId(),
      name: p.name,
      value: p.value,
      type: 'text' as CustomFieldType,
      sensitive: false,
    }));
    onImport(fields);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-lg">Bulk Paste Import</h3>
            <p className="text-gray-400 text-xs mt-0.5">One field per line · <span className="text-cyan-400">Name: Value</span> format</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <textarea
          className="w-full h-40 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all text-sm font-mono resize-none"
          placeholder={`Seller SKU ID: TTE-Classic-Black-03\nMRP: 1899\nSelling Price: 399\nListing Status: Active\nGST: 18%`}
          value={raw}
          onChange={e => handleChange(e.target.value)}
          autoFocus
        />

        {preview.length > 0 && (
          <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
            <p className="text-gray-400 text-xs mb-1.5">{preview.length} field{preview.length !== 1 ? 's' : ''} to import:</p>
            {preview.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-cyan-400 font-medium min-w-0 truncate">{p.name}</span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-300 truncate">{p.value || '(empty)'}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleImport}
          className="mt-5 w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-base shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-95 transition-all"
        >
          Import {preview.length > 0 ? `${preview.length} Fields` : 'Fields'}
        </button>
      </div>
    </div>
  );
}

// ── Preset Preview Sheet / Modal ────────────────────────────────────────

export interface PresetPreviewSheetProps {
  preset: (typeof PROFILE_PRESETS)[0];
  onClose: () => void;
  onApply: (profileName: string, profileUrl: string) => void;
}

export function PresetPreviewSheet({ preset, onClose, onApply }: PresetPreviewSheetProps) {
  const [profileName, setProfileName] = useState(preset.name);
  const [profileUrl, setProfileUrl] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const handleCreate = async () => {
    if (!profileName.trim()) {
      toast.error('Profile name is required');
      return;
    }
    setIsApplying(true);
    try {
      await onApply(profileName.trim(), profileUrl.trim());
    } finally {
      setIsApplying(false);
    }
  };

  const accentColors: Record<string, string> = {
    ecommerce_seller: '#f97316',
    personal_id: '#3b82f6',
    banking_finance: '#f59e0b',
    job_application: '#8b5cf6',
    medical_health: '#ef4444',
  };
  const accentColor = accentColors[preset.id] || '#06b6d4';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />

      {/* Sheet / Modal */}
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between border-b border-white/5">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-inner"
              style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}40` }}
            >
              {preset.id === 'ecommerce_seller' ? '🛒' : preset.id === 'personal_id' ? '🪪' : preset.id === 'banking_finance' ? '🏦' : preset.id === 'job_application' ? '💼' : '🏥'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-lg">{preset.name}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                  Profile Template
                </span>
              </div>
              <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{preset.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {/* Profile Details Inputs */}
          <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Profile Name
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Profile Name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Target Website URL (Optional)
              </label>
              <input
                type="text"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="e.g. https://seller.flipkart.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          {/* Predefined Fields Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>📋</span> Included Custom Fields ({preset.fields.length})
              </span>
              <span className="text-[11px] text-gray-500">Ready for values</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {preset.fields.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-white text-sm font-medium truncate">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.sensitive && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        🔒 Sensitive
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-gray-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5 uppercase">
                      {f.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#0a0f1e]/80 border-t border-white/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isApplying}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isApplying ? (
              <span>Creating Profile...</span>
            ) : (
              <>
                <span>⚡ Use This Template</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit Field Bottom Sheet ─────────────────────────────────────────

interface FieldSheetProps {
  initial?: CustomField;
  onSave: (field: CustomField) => void;
  onClose: () => void;
}

function FieldSheet({ initial, onSave, onClose }: FieldSheetProps) {
  const [name, setName] = useState(initial?.name || '');
  const [value, setValue] = useState(initial?.value || '');
  const [type, setType] = useState<CustomFieldType>(initial?.type || 'text');
  const [sensitive, setSensitive] = useState(initial?.sensitive ?? false);
  const [showValue, setShowValue] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Field name is required');
      return;
    }
    onSave({
      id: initial?.id || generateFieldId(),
      name: name.trim(),
      value: value.trim(),
      type,
      sensitive: sensitive || type === 'password',
    });
  };

  // Auto-set sensitive when type is password
  useEffect(() => {
    if (type === 'password') setSensitive(true);
  }, [type]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl animate-slide-up">
        {/* Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">
            {initial ? 'Edit Field' : 'Add Field'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Field Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">
              Field Name
            </label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              placeholder="e.g. Weight, Blood Group, DOB…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Field Type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">
              Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                    type === t
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  {FIELD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Field Value */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">
              Value
            </label>
            <div className="relative">
              <input
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all pr-11"
                placeholder={type === 'date' ? 'YYYY-MM-DD' : `Enter ${FIELD_TYPE_LABELS[type].toLowerCase()}…`}
                type={type === 'date' ? 'date' : (sensitive && !showValue) ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {sensitive && (
                <button
                  onClick={() => setShowValue((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Sensitive toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-white text-sm font-medium">Sensitive / Secret</p>
              <p className="text-gray-400 text-xs mt-0.5">Mask value like a password</p>
            </div>
            <button
              onClick={() => setSensitive((s) => !s)}
              disabled={type === 'password'}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                sensitive ? 'bg-cyan-500' : 'bg-white/10'
              } ${type === 'password' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  sensitive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-base shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-95 transition-all"
        >
          {initial ? 'Save Changes' : 'Add Field'}
        </button>
      </div>
    </div>
  );
}

// ── Profile Edit Panel (name / icon / color) ────────────────────────────

interface ProfileMetaSheetProps {
  initial?: Pick<FieldProfile, 'name' | 'url' | 'icon' | 'color'>;
  onSave: (meta: { name: string; url?: string; icon: string; color: string; fields?: CustomField[] }) => void;
  onClose: () => void;
  title: string;
}

function ProfileMetaSheet({ initial, onSave, onClose, title }: ProfileMetaSheetProps) {
  const [name, setName] = useState(initial?.name || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [icon, setIcon] = useState(initial?.icon || 'User');
  const [color, setColor] = useState(initial?.color || '#06b6d4');
  const [presetFields, setPresetFields] = useState<CustomField[] | undefined>(undefined);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    onSave({
      name: name.trim(),
      url: url.trim() || undefined,
      icon,
      color,
      ...(presetFields !== undefined ? { fields: presetFields } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">Profile Name</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              placeholder="e.g. My Personal Info"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Quick Preset Selector */}
          {!initial && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">Or Start From Preset</label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {PROFILE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setName(preset.name);
                      setIcon(preset.icon);
                      setColor(preset.color);
                      const generated = preset.fields.map((f, i) => ({
                        id: generateFieldId(),
                        name: f.name,
                        value: '',
                        type: f.type,
                        sensitive: f.sensitive,
                      }));
                      setPresetFields(generated);
                      toast.info(`Selected preset "${preset.name}" (${generated.length} fields)`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/40 text-xs text-gray-300 font-medium whitespace-nowrap transition-all active:scale-95"
                  >
                    <span>{preset.id === 'ecommerce_seller' ? '🛒' : preset.id === 'personal_id' ? '🪪' : preset.id === 'banking_finance' ? '🏦' : preset.id === 'job_application' ? '💼' : '🏥'}</span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Website URL */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">Website URL (Optional)</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              placeholder="e.g. https://seller.flipkart.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Icon */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">Icon</label>
            <div className="grid grid-cols-5 gap-2">
              {PROFILE_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center p-3 rounded-xl transition-all ${
                    icon === ic
                      ? 'border border-white/30 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
                  }`}
                  style={icon === ic ? { backgroundColor: color + '33', borderColor: color + '66' } : undefined}
                >
                  {ProfileIconMap[ic]}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">Accent Color</label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-[#0f172a] ring-white/80 scale-110' : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-base shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-95 transition-all"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Profile Detail View ─────────────────────────────────────────────────

interface ProfileDetailProps {
  profile: FieldProfile;
  onBack: () => void;
  onDelete: () => void;
}

function ProfileDetail({ profile, onBack, onDelete }: ProfileDetailProps) {
  const profileFields = profile.fields || [];
  const [showFieldSheet, setShowFieldSheet] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | undefined>();
  const [showMetaSheet, setShowMetaSheet] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const copyField = useCallback((field: CustomField) => {
    navigator.clipboard.writeText(field.value).then(() => {
      setCopiedId(field.id);
      toast.success(`"${field.name}" copied`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const toggleHidden = (id: string) => {
    setHiddenFields((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveField = async (field: CustomField) => {
    try {
      await upsertFieldInProfile(profile.id, field);
      toast.success(editingField ? 'Field updated' : 'Field added');
      setShowFieldSheet(false);
      setEditingField(undefined);
    } catch {
      toast.error('Failed to save field');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      await deleteFieldFromProfile(profile.id, fieldId);
      toast.success('Field removed');
      setDeletingFieldId(null);
    } catch {
      toast.error('Failed to delete field');
    }
  };

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    const fields = [...profileFields];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    [fields[index], fields[targetIdx]] = [fields[targetIdx], fields[index]];
    await reorderFieldsInProfile(profile.id, fields.map((f) => f.id));
  };

  const handleSaveMeta = async (meta: { name: string; url?: string; icon: string; color: string }) => {
    try {
      await updateFieldProfile(profile.id, meta);
      setShowMetaSheet(false);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const handleBulkImport = async (fields: CustomField[]) => {
    try {
      for (const field of fields) {
        await upsertFieldInProfile(profile.id, field);
      }
      setShowBulkImport(false);
      toast.success(`✅ Imported ${fields.length} field${fields.length !== 1 ? 's' : ''}!`);
    } catch {
      toast.error('Failed to import fields');
    }
  };

  const accentColor = profile.color || '#06b6d4';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {/* Profile icon */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: accentColor + '22', color: accentColor }}
            >
              {ProfileIconMap[profile.icon || 'User'] ?? <LayoutList className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-white font-semibold text-base leading-tight">{profile.name}</h2>
              <p className="text-gray-400 text-xs truncate">
                {profile.url ? profile.url : `${profileFields.length} field${profileFields.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowBulkImport(true)}
              title="Bulk paste import"
              className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10"
            >
              <ClipboardList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowMetaSheet(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Field List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {profileFields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <LayoutList className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-300 font-medium">No fields yet</p>
            <p className="text-gray-500 text-sm mt-1">Tap "Add Field" to get started</p>
          </div>
        )}

        {profileFields.map((field, idx) => {
          const isHidden = field.sensitive && !hiddenFields[field.id];
          const isCopied = copiedId === field.id;
          const isDeleting = deletingFieldId === field.id;

          return (
            <div
              key={field.id}
              className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 group"
            >
              {!isDeleting ? (
                <div className="flex items-start gap-3">
                  {/* Order controls */}
                  <div className="flex flex-col gap-0.5 mt-0.5 shrink-0">
                    <button
                      onClick={() => handleMoveField(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveField(idx, 'down')}
                      disabled={idx === profileFields.length - 1}
                      className="p-1 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">{field.name}</p>
                    <p
                      className={`text-white text-sm font-mono break-all leading-relaxed ${
                        isHidden ? 'tracking-widest text-gray-400' : ''
                      }`}
                    >
                      {isHidden ? '••••••••' : field.value || <span className="text-gray-600 italic font-sans">empty</span>}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-gray-600 text-xs capitalize">{FIELD_TYPE_LABELS[field.type]}</span>
                      {field.sensitive && (
                        <span className="text-xs text-amber-400/70">· sensitive</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {field.sensitive && (
                      <button
                        onClick={() => toggleHidden(field.id)}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                      >
                        {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => copyField(field)}
                      className={`p-2 rounded-lg transition-colors ${
                        isCopied ? 'text-cyan-400 bg-cyan-500/10' : 'text-gray-500 hover:text-cyan-400 hover:bg-white/5'
                      }`}
                    >
                      {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditingField(field); setShowFieldSheet(true); }}
                      className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingFieldId(field.id)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Delete confirm inline */
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-gray-300 text-sm flex-1">Delete "{field.name}"?</p>
                  <button
                    onClick={() => setDeletingFieldId(null)}
                    className="px-3 py-1.5 rounded-lg text-gray-400 hover:bg-white/5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteField(field.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Danger Zone: Delete Profile */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete Profile
          </button>
        </div>

        {/* Spacer for FAB */}
        <div className="h-20" />
      </div>

      {/* FABs: Add Field + Bulk Paste */}
      <div className="fixed bottom-6 inset-x-0 flex justify-center gap-3 pointer-events-none">
        <button
          onClick={() => setShowBulkImport(true)}
          className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 border border-white/10 text-gray-200 font-medium shadow-lg hover:bg-white/20 active:scale-95 transition-all text-sm"
        >
          <ClipboardList className="w-4 h-4" />
          Bulk Paste
        </button>
        <button
          onClick={() => { setEditingField(undefined); setShowFieldSheet(true); }}
          className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/30 hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          Add Field
        </button>
      </div>

      {/* Delete Profile Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-[#0f172a] border border-white/10 rounded-2xl p-6 mx-4 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Delete Profile?</h3>
            </div>
            <p className="text-gray-400 text-sm mb-5">
              This will permanently delete "{profile.name}" and all {profileFields.length} field{profileFields.length !== 1 ? 's' : ''} inside it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheets */}
      {showFieldSheet && (
        <FieldSheet
          initial={editingField}
          onSave={handleSaveField}
          onClose={() => { setShowFieldSheet(false); setEditingField(undefined); }}
        />
      )}
      {showMetaSheet && (
        <ProfileMetaSheet
          title="Edit Profile"
          initial={{ name: profile.name, url: profile.url, icon: profile.icon, color: profile.color }}
          onSave={handleSaveMeta}
          onClose={() => setShowMetaSheet(false)}
        />
      )}
      {showBulkImport && (
        <BulkImportSheet
          onImport={handleBulkImport}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </div>
  );
}

// ── Main: ManageProfiles ────────────────────────────────────────────────

export default function ManageProfiles() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<FieldProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showNewProfileSheet, setShowNewProfileSheet] = useState(false);
  const [editingMetaProfile, setEditingMetaProfile] = useState<FieldProfile | null>(null);
  const [deletingProfileTarget, setDeletingProfileTarget] = useState<FieldProfile | null>(null);

  useEffect(() => {
    const unsub = subscribeToFieldProfiles(setProfiles);
    return unsub;
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const handleCreateProfile = async (meta: { name: string; url?: string; icon: string; color: string; fields?: CustomField[] }) => {
    try {
      const fields = meta.fields || [];
      const p = await addFieldProfile({ name: meta.name, url: meta.url, icon: meta.icon, color: meta.color, fields });
      setShowNewProfileSheet(false);
      setActiveProfileId(p.id);
      toast.success(`Profile "${p.name}" created`);
    } catch {
      toast.error('Failed to create profile');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await deleteFieldProfile(id);
      if (activeProfileId === id) setActiveProfileId(null);
      toast.success('Profile deleted');
    } catch {
      toast.error('Failed to delete profile');
    }
  };

  const handleDuplicateProfile = async (profile: FieldProfile) => {
    try {
      const duplicatedFields = profile.fields.map(f => ({
        ...f,
        id: generateFieldId(),
      }));
      const newProfile = await addFieldProfile({
        name: `${profile.name} (Copy)`,
        url: profile.url,
        icon: profile.icon,
        color: profile.color,
        fields: duplicatedFields,
      });
      setActiveProfileId(newProfile.id);
      toast.success(`Duplicated as "${newProfile.name}"`);
    } catch {
      toast.error('Failed to duplicate profile');
    }
  };

  // ── Profile Detail ──
  if (activeProfile) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
        <ProfileDetail
          profile={activeProfile}
          onBack={() => setActiveProfileId(null)}
          onDelete={() => handleDeleteProfile(activeProfile.id)}
        />
      </div>
    );
  }

  // ── Profile List ──
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0f1e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-white font-semibold text-lg">Custom Field Profiles</h2>
              <p className="text-gray-400 text-xs">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewProfileSheet(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {/* Info Banner */}
        <div className="mb-5 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <LayoutList className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-gray-200 text-sm font-medium">Profiles for Autofill</p>
            <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">
              Create named profiles with custom fields like weight, blood group, or any info you fill repeatedly in forms. Tap any field value to copy it.
            </p>
          </div>
        </div>

        {/* Empty state */}
        {profiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
              style={{ background: 'linear-gradient(135deg, #0891b2, #3b82f6)' }}
            >
              <LayoutList className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-white font-semibold text-xl mb-2">No Profiles Yet</h3>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-6">
              Create your first profile to start saving custom info for easy autofill.
            </p>
            <button
              onClick={() => setShowNewProfileSheet(true)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/30 hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
              Create Profile
            </button>
          </div>
        )}

        {/* Profile Cards */}
        <div className="space-y-3">
          {profiles.map((profile) => {
            const accentColor = profile.color || '#06b6d4';
            const profileFields = profile.fields || [];
            return (
              <div
                key={profile.id}
                className="w-full flex items-center gap-4 p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl hover:bg-white/[0.07] active:scale-[0.98] transition-all text-left group cursor-pointer"
                onClick={() => setActiveProfileId(profile.id)}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: accentColor + '22', color: accentColor }}
                >
                  {ProfileIconMap[profile.icon || 'User'] ?? <LayoutList className="w-6 h-6" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-base truncate">{profile.name}</p>
                  {profile.url && (
                    <p className="text-cyan-400/80 text-xs truncate mt-0.5">{profile.url}</p>
                  )}
                  <p className="text-gray-400 text-xs mt-0.5">
                    {profileFields.length === 0
                      ? 'No fields'
                      : `${profileFields.length} field${profileFields.length !== 1 ? 's' : ''}`}
                    {profileFields.length > 0 && (
                      <span className="text-gray-600"> · {profileFields.slice(0, 2).map(f => f.name).join(', ')}{profileFields.length > 2 ? '…' : ''}</span>
                    )}
                  </p>
                </div>

                {/* Action Buttons: Rename, Duplicate, Delete */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Rename / Edit */}
                  <button
                    onClick={e => { e.stopPropagation(); setEditingMetaProfile(profile); }}
                    title="Rename / Edit profile"
                    className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Duplicate */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDuplicateProfile(profile); }}
                    title="Duplicate profile"
                    className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                  >
                    <Layers className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); setDeletingProfileTarget(profile); }}
                    title="Delete profile"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors ml-1" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Spacer for FAB */}
        {profiles.length > 0 && <div className="h-24" />}
      </div>

      {/* FAB (when profiles exist) */}
      {profiles.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center pointer-events-none">
          <button
            onClick={() => setShowNewProfileSheet(true)}
            className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/30 hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5" />
            New Profile
          </button>
        </div>
      )}

      {/* New Profile Sheet */}
      {showNewProfileSheet && (
        <ProfileMetaSheet
          title="New Profile"
          onSave={handleCreateProfile}
          onClose={() => setShowNewProfileSheet(false)}
        />
      )}

      {/* Rename / Edit Profile Sheet */}
      {editingMetaProfile && (
        <ProfileMetaSheet
          title="Rename / Edit Profile"
          initial={{
            name: editingMetaProfile.name,
            url: editingMetaProfile.url,
            icon: editingMetaProfile.icon,
            color: editingMetaProfile.color,
          }}
          onSave={async (meta) => {
            try {
              await updateFieldProfile(editingMetaProfile.id, meta);
              setEditingMetaProfile(null);
              toast.success('Profile updated');
            } catch {
              toast.error('Failed to update profile');
            }
          }}
          onClose={() => setEditingMetaProfile(null)}
        />
      )}

      {/* Delete Profile Confirmation Dialog */}
      {deletingProfileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeletingProfileTarget(null)} />
          <div className="relative bg-[#0f172a] border border-white/10 rounded-2xl p-6 mx-4 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Delete Profile?</h3>
            </div>
            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
              This will permanently delete <span className="text-white font-medium">"{deletingProfileTarget.name}"</span> and all {(deletingProfileTarget.fields || []).length} field{(deletingProfileTarget.fields || []).length !== 1 ? 's' : ''} inside it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingProfileTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const targetId = deletingProfileTarget.id;
                  setDeletingProfileTarget(null);
                  await handleDeleteProfile(targetId);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
