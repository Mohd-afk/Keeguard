// PURPOSE: Design system token definitions for colors.
/**
 * Figma Simple Design System (SDS) - Color Tokens
 */
export const colors = {
  background: {
    dark: '#1a1a2e',
    card: '#16213e',
    overlay: 'rgba(0, 0, 0, 0.6)',
    muted: '#0f172a',
  },
  primary: {
    main: '#06b6d4',
    hover: '#0891b2',
    light: '#67e8f9',
    dark: '#0e7490',
  },
  accent: {
    purple: '#8b5cf6',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
  },
  text: {
    primary: '#f3f4f6',
    secondary: '#9ca3af',
    muted: '#6b7280',
    inverse: '#111827',
  },
  border: {
    subtle: 'rgba(6, 182, 212, 0.15)',
    default: 'rgba(255, 255, 255, 0.1)',
    focus: '#06b6d4',
  },
} as const;
