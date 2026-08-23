import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Eye, EyeOff, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/ui/primitives/dialog';
import { getSessionPassword } from '@/app/store';

interface StepUpAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  actionDescription?: string;
}

export function StepUpAuthModal({
  open,
  onOpenChange,
  onSuccess,
  actionDescription = 'perform this secure action',
}: StepUpAuthModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Artificial tiny delay to simulate deep verification and keep UI transitions smooth and premium
    setTimeout(() => {
      const activePassword = getSessionPassword();
      if (activePassword && password === activePassword) {
        setLoading(false);
        setPassword('');
        onSuccess();
        onOpenChange(false);
      } else {
        setLoading(false);
        setError('Incorrect master password');
      }
    }, 450);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!loading) {
        onOpenChange(val);
        if (!val) {
          setPassword('');
          setError('');
        }
      }
    }}>
      <DialogContent className="sm:max-w-md bg-[#16213e]/90 border border-cyan-500/20 text-white backdrop-blur-md shadow-2xl shadow-cyan-950/40 rounded-2xl p-6">
        <DialogHeader className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-2 animate-pulse">
            <Lock className="w-5 h-5 text-cyan-400" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-wide flex items-center gap-2">
            Secure Action Verification
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm mt-2 px-2">
            You are attempting to <span className="text-cyan-400 font-medium">{actionDescription}</span>. Please verify your identity by entering your master password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-400 font-medium tracking-wider uppercase pl-1">
              Master Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-cyan-500/60" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your master password"
                className="w-full bg-[#0f172a]/60 border border-cyan-500/25 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-sm"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-500/60 hover:text-cyan-400 transition-colors"
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs pl-1 bg-red-500/10 border border-red-500/20 py-2 px-3 rounded-lg animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                setPassword('');
                setError('');
                onOpenChange(false);
              }}
              disabled={loading}
              className="w-full sm:w-1/2 bg-[#1e293b]/60 hover:bg-[#1e293b] border border-gray-700 text-gray-300 py-2.5 rounded-xl text-sm transition-all hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full sm:w-1/2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Proceed'
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
