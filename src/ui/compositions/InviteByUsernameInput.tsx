// PURPOSE: Renders the InviteByUsernameInput screen interface component and user actions.
import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, User, Check } from 'lucide-react';
import { searchProfiles } from '@/app/stores/accessStore';
import { type UserSearchResult } from '@/app/api/users';
import { useDebounce } from '@/app/hooks/useDebounce';

// If useDebounce doesn't exist, we can implement it inline or create it.
// Let's create a quick inline debounce or search for it.
// Let's see if hook useDebounce exists. Let's list the hooks folder first!
// We can use a simple custom debounce inside.
interface InviteByUsernameInputProps {
  onSelectUser: (user: UserSearchResult | null) => void;
  selectedUser: UserSearchResult | null;
}

export function InviteByUsernameInput({ onSelectUser, selectedUser }: InviteByUsernameInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Simple debounce logic
  useEffect(() => {
    const cleanedQuery = query.trim().replace(/^@/, '');
    if (!cleanedQuery) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const delayDebounce = setTimeout(async () => {
      try {
        if (cleanedQuery.length < 3) {
          setResults([]);
          setSearching(false);
          return;
        }
        const matchingUsers = await searchProfiles(cleanedQuery);
        setResults(matchingUsers);
      } catch (err) {
        console.error('Failed to search users', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const selectUser = (user: UserSearchResult) => {
    onSelectUser(user);
    setQuery(`@${user.username}`);
    setShowDropdown(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="text-gray-400 text-xs font-semibold mb-1.5 block">
        Invite Member by @username
      </label>
      
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
          <Search className="w-4 h-4" />
        </span>
        
        <input
          type="text"
          value={selectedUser ? `@${selectedUser.username}` : query}
          onChange={(e) => {
            const val = e.target.value;
            // Allow clearing selection
            if (selectedUser) {
              onSelectUser(null);
              setQuery('');
            } else {
              setQuery(val);
              setShowDropdown(true);
            }
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Type username (e.g. afk)..."
          className="w-full bg-[#16213e] border border-white/5 rounded-xl py-2.5 pl-10 pr-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          spellCheck="false"
        />

        {searching && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          </span>
        )}

        {selectedUser && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400">
            <Check className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* Suggestion Dropdown */}
      {showDropdown && (query.trim() !== '') && !selectedUser && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#16213e] border border-white/10 rounded-xl max-h-56 overflow-y-auto z-50 shadow-2xl divide-y divide-white/5 animate-in fade-in slide-in-from-top-1 duration-150">
          {searching ? (
            <div className="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching profiles...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">
              No matching profiles found
            </div>
          ) : (
            results.map((user) => (
              <button
                key={user.uid}
                type="button"
                onClick={() => selectUser(user)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors active:bg-white/10"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-semibold truncate">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-gray-500 text-[10px] truncate">
                    @{user.username}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
