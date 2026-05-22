import { useState, useEffect } from 'react';
import { AlertTriangle, Check, Cloud, Smartphone, HelpCircle } from 'lucide-react';
import { getActiveConflict, resolveConflict, addConflictListener, type ConflictState } from '../../stores/syncStore';

export function ConflictResolverSheet() {
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [activeTab, setActiveTab] = useState<'server' | 'local' | 'manual'>('server');
  const [mergedTitle, setMergedTitle] = useState('');
  const [mergedPlaintext, setMergedPlaintext] = useState('');

  useEffect(() => {
    // Check if there is an active conflict
    const active = getActiveConflict();
    setConflict(active);

    if (active) {
      setMergedTitle(active.localDraft.title);
      setMergedPlaintext(active.localDraft.plaintext);
    }

    // Subscribe to conflict changes
    const unsub = addConflictListener((current: ConflictState | null) => {
      setConflict(current);
      if (current) {
        setMergedTitle(current.localDraft.title);
        setMergedPlaintext(current.localDraft.plaintext);
      }
    });

    return unsub;
  }, []);

  if (!conflict) return null;

  const handleResolveKeepServer = () => {
    resolveConflict(false);
  };

  const handleResolveKeepLocal = () => {
    resolveConflict(true);
  };

  const handleResolveMerged = () => {
    resolveConflict(true, mergedTitle, mergedPlaintext);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Bottom Sheet Container */}
      <div className="relative w-full bg-[#16213e] border-t border-rose-500/20 rounded-t-3xl p-5 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_16px)] flex flex-col gap-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
        
        {/* Handle bar with danger status glow */}
        <div className="w-12 h-1.5 bg-rose-500/40 rounded-full mx-auto -mt-2 mb-1 shadow-[0_0_10px_rgba(239,68,68,0.3)]" />

        {/* Header Title with warning icon */}
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base">Sync Conflict Detected</h3>
            <p className="text-gray-400 text-[10px]">
              Someone else updated this password while you were editing it.
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-[#1a1a2e] p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('server')}
            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'server' ? 'bg-[#16213e] text-cyan-400 border border-cyan-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Keep Server
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'local' ? 'bg-[#16213e] text-cyan-400 border border-cyan-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Keep Local
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'manual' ? 'bg-[#16213e] text-cyan-400 border border-cyan-500/15' : 'text-gray-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Resolve Custom
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 max-h-[300px] overflow-y-auto pr-1">
          {activeTab === 'server' && (
            <div className="space-y-3 bg-[#1a1a2e]/55 border border-white/5 p-4 rounded-2xl animate-in fade-in duration-200">
              <div>
                <p className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider">Title</p>
                <p className="text-white text-sm font-bold mt-0.5">{conflict.serverItem.title}</p>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider">Payload Content</p>
                <pre className="text-gray-300 text-xs mt-1 bg-black/10 p-2 rounded-lg font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {conflict.serverItem.plaintext}
                </pre>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500">
                <span>Updated By: @{conflict.serverItem.updatedBy || 'member'}</span>
                <span>Version Revision: r{conflict.latestRevision}</span>
              </div>
            </div>
          )}

          {activeTab === 'local' && (
            <div className="space-y-3 bg-[#1a1a2e]/55 border border-white/5 p-4 rounded-2xl animate-in fade-in duration-200">
              <div>
                <p className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider">Title</p>
                <p className="text-white text-sm font-bold mt-0.5">{conflict.localDraft.title}</p>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider">Your Draft Content</p>
                <pre className="text-gray-300 text-xs mt-1 bg-black/10 p-2 rounded-lg font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {conflict.localDraft.plaintext}
                </pre>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500">
                <span>Created locally by you</span>
                <span>Original Base: r{conflict.baseRevision}</span>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-3 bg-[#1a1a2e]/55 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 animate-in fade-in duration-200">
              <div>
                <label className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider block mb-1">
                  Merged Item Title
                </label>
                <input
                  type="text"
                  value={mergedTitle}
                  onChange={(e) => setMergedTitle(e.target.value)}
                  className="w-full bg-[#16213e] border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="text-gray-500 text-[9px] uppercase font-extrabold tracking-wider block mb-1">
                  Merged Item Content
                </label>
                <textarea
                  value={mergedPlaintext}
                  onChange={(e) => setMergedPlaintext(e.target.value)}
                  rows={4}
                  className="w-full bg-[#16213e] border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-cyan-500/50 resize-none leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action CTAs */}
        <div className="mt-2 border-t border-white/5 pt-3">
          {activeTab === 'server' && (
            <button
              onClick={handleResolveKeepServer}
              className="w-full py-3 bg-[#1a1a2e] border border-white/10 hover:bg-white/5 text-cyan-400 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Accept Cloud Version (Drop My Draft)
            </button>
          )}

          {activeTab === 'local' && (
            <button
              onClick={handleResolveKeepLocal}
              className="w-full py-3 bg-[#1a1a2e] border border-white/10 hover:bg-white/5 text-cyan-400 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Overwrite Cloud Version (Keep My Draft)
            </button>
          )}

          {activeTab === 'manual' && (
            <button
              onClick={handleResolveMerged}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 transition-all flex items-center justify-center gap-2 border border-cyan-400/20"
            >
              <Check className="w-4 h-4" />
              Commit Resolved Merged Version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
