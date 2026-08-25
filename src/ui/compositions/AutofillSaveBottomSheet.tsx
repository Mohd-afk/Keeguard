// PURPOSE: Renders the AutofillSaveBottomSheet screen interface component and user actions.
import React, { useEffect, useState } from 'react';
import { 
  isVaultUnlocked, 
  addVaultItem, 
  updateVaultItem, 
  subscribeToCustomCategories, 
  type CustomCategory 
} from '@/app/store';
import { AutofillBridge, type AutofillSaveEvent } from '@/app/services/autofillBridge';
import { KeyRound, Shield, X, Check, FolderHeart, Globe, Lock, Eye, EyeOff } from 'lucide-react';

interface AutofillSaveBottomSheetProps {
  event: AutofillSaveEvent | null;
  onDismiss: () => void;
}

export function AutofillSaveBottomSheet({ event, onDismiss }: AutofillSaveBottomSheetProps) {
  const [animate, setAnimate] = useState(false);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat_passwords');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Subscribe to categories
  useEffect(() => {
    const unsub = subscribeToCustomCategories((cats) => {
      // Filter out hidden or parent groups, or just show active categories
      const activeCats = cats.filter(c => !c.isHidden);
      setCategories(activeCats);
    });
    return () => unsub();
  }, []);

  // Slide up transition on mount/event set
  useEffect(() => {
    if (event) {
      if (event.suggestedCategoryId) {
        setSelectedCategoryId(event.suggestedCategoryId);
      } else {
        setSelectedCategoryId('cat_passwords');
      }
      const t = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(t);
    } else {
      setAnimate(false);
    }
  }, [event]);

  if (!event) return null;

  const isUpdate = event.action === 'update';
  const displayDomain = event.domain || 'unknown.com';
  
  // Create a high-quality fallback domain/package icon URL or fallback text
  const faviconUrl = event.domain && event.domain.includes('.') 
    ? `https://www.google.com/s2/favicons?domain=${event.domain}&sz=64` 
    : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const unlocked = isVaultUnlocked();
      
      // 1. JS-side Save / Update (if vault is unlocked)
      if (unlocked) {
        if (isUpdate && event.credentialId) {
          await updateVaultItem(event.credentialId, {
            password: event.password || '',
            updatedAt: new Date().toISOString()
          });
        } else {
          // Format URL cleanly for Website item
          const isApp = !displayDomain.includes('.') && !displayDomain.startsWith('http');
          const formattedUrl = isApp ? '' : (displayDomain.startsWith('http') ? displayDomain : `https://${displayDomain}`);
          
          await addVaultItem({
            title: displayDomain,
            username: event.username,
            password: event.password || '',
            type: isApp ? 'App' : 'Website',
            url: formattedUrl,
            note: 'Saved automatically via Autofill Service',
            categoryId: selectedCategoryId,
            isFavorite: false,
            labels: []
          });
        }
      }

      // 2. Native SQLCipher Save/Update (always runs, acts as fallback/master database on Android)
      await AutofillBridge.saveCredentialFromAutofill({
        action: event.action,
        domain: displayDomain,
        username: event.username,
        password: event.password,
        categoryId: selectedCategoryId,
        credentialId: event.credentialId
      });

      // Slide down and dismiss
      setAnimate(false);
      setTimeout(() => {
        onDismiss();
      }, 300);
    } catch (err) {
      console.error('Failed to handle autofill save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await AutofillBridge.dismissSavePrompt();
    } catch (err) {
      console.warn('Failed to call dismissSavePrompt:', err);
    }
    setAnimate(false);
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop with elegant blur */}
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${animate ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleDismiss}
      />

      {/* Glassmorphic Sheet */}
      <div
        className={`relative w-full max-w-md bg-[#16213e]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl px-6 pt-5 pb-[max(env(safe-area-inset-bottom),_24px)] shadow-2xl transition-transform duration-300 ease-out transform ${
          animate ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
            {faviconUrl ? (
              <img 
                src={faviconUrl} 
                alt={displayDomain} 
                className="w-8 h-8 rounded-lg"
                onError={(e) => {
                  // Fallback to Lucide Icon if image fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Globe className="w-6 h-6 text-cyan-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white text-lg font-bold leading-tight">
              {isUpdate ? 'Update Password?' : 'Save Login?'}
            </h3>
            <p className="text-gray-400 text-sm truncate leading-snug mt-0.5">{displayDomain}</p>
          </div>
          <button 
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lock status banner (Warning if vault is locked) */}
        {!isVaultUnlocked() && (
          <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              Your vault is currently locked. The login will be saved offline on this device and synced next time you unlock SecureVault.
            </div>
          </div>
        )}

        {/* Content Box */}
        <div className="space-y-3.5 mb-6">
          {/* Username Field */}
          <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3 flex justify-between items-center">
            <div>
              <span className="text-gray-400 text-xs block mb-0.5">Username</span>
              <span className="text-white text-sm font-semibold truncate max-w-[260px] block">
                {event.username || <span className="text-gray-500 italic font-normal">None</span>}
              </span>
            </div>
            <span className="text-xs bg-white/10 text-gray-300 px-2.5 py-1 rounded-full font-medium">Autofill</span>
          </div>

          {/* Password Field */}
          <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3 flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <span className="text-gray-400 text-xs block mb-0.5">Password</span>
              <span className="text-white text-sm font-semibold truncate block pr-2">
                {showPassword ? event.password : '••••••••••••'}
              </span>
            </div>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-white p-1 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {/* Category Dropdown (Only for new items) */}
          {!isUpdate && (
            <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3 flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <span className="text-gray-400 text-xs block mb-0.5">Category</span>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="bg-transparent text-cyan-400 text-sm font-semibold w-full focus:outline-none cursor-pointer pr-4"
                  style={{
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2306b6d4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right center'
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-[#16213e] text-white">
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Buttons / Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            disabled={saving}
            className="flex-1 py-3.5 px-4 rounded-xl border border-white/10 text-white font-semibold text-sm hover:bg-white/5 active:bg-white/10 transition-colors duration-200 outline-none"
          >
            Dismiss
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-50 text-black font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all duration-200 outline-none transform active:scale-98"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isUpdate ? 'Update' : 'Save'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
