// PURPOSE: Renders SVG icon component for BellIcon.
import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { addNotificationsListener } from '@/app/stores/notificationsStore';

interface BellIconProps {
  onClick: () => void;
}

export function BellIcon({ onClick }: BellIconProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Subscribe to notifications changes to update unread count dynamically
    const unsubscribe = addNotificationsListener((_, count) => {
      setUnreadCount(count);
    });
    return unsubscribe;
  }, []);

  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all relative group flex items-center justify-center active:scale-95"
      aria-label="View notifications"
    >
      <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-[swing_1s_ease-in-out_infinite]' : ''}`} />
      
      {unreadCount > 0 && (
        <>
          {/* Pulsing indicator aura */}
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          {/* Count Badge */}
          <span className="absolute -top-1 -right-1 bg-cyan-500 text-white text-[9px] font-bold px-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center border border-[#1a1a2e] shadow-lg scale-95 group-hover:scale-100 transition-transform">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </>
      )}
    </button>
  );
}
