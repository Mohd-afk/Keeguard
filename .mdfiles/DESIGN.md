# 🎨 Keeguard — Design System Reference (Figma SDS)

> **Design Guide & Token Reference for Figma Simple Design System (SDS)**  
> *Use this guide to maintain visual consistency across all UI components and views.*

---

## 🎨 1. Color System (`src/tokens/colors.ts`)

### Primary & Accent Palette
- **Primary Main**: `#06b6d4` (Cyan-500) — Main CTA buttons, active tabs, highlights.
- **Primary Hover**: `#0891b2` (Cyan-600) — Button hover states.
- **Primary Light**: `#67e8f9` (Cyan-300) — Accent indicators & text highlights.
- **Accent Purple**: `#8b5cf6` — Special feature badges.
- **Accent Emerald**: `#10b981` — Success indicators & strong security state.
- **Accent Amber**: `#f59e0b` — Warnings, medium security, pending items.
- **Accent Red**: `#ef4444` — Danger state, delete buttons, weak passwords.

### Dark Theme Backgrounds
- **Background Dark**: `#1a1a2e` — App base container background.
- **Background Card**: `#16213e` — Card panels, modal sheets, vault rows.
- **Background Muted**: `#0f172a` — Header bars & inset inputs.
- **Overlay**: `rgba(0, 0, 0, 0.6)` — Backdrop blur overlay for modals/drawers.

---

## 🔤 2. Typography (`src/tokens/typography.ts`)

- **Font Family**:
  - `sans`: `Inter, system-ui, -apple-system, sans-serif` (Default UI text)
  - `mono`: `JetBrains Mono, Fira Code, monospace` (Passwords, keys, verification codes)
- **Font Sizes**: `xs` (0.75rem), `sm` (0.875rem), `base` (1rem), `lg` (1.125rem), `xl` (1.25rem), `2xl` (1.5rem), `3xl` (1.875rem).
- **Font Weights**: `normal` (400), `medium` (500), `semibold` (600), `bold` (700).

---

## 📐 3. Spacing & Border Radius (`src/tokens/spacing.ts`)

- **Spacing Scale**: `space-1` (0.25rem) up to `space-12` (3rem).
- **Border Radius**:
  - `sm`: `0.25rem` (Badges, tags)
  - `md`: `0.375rem` (Input fields)
  - `lg`: `0.5rem` (Buttons)
  - `xl`: `0.75rem` (Cards)
  - `2xl`: `1rem` (Modals, bottom sheets, main list cards)
  - `full`: `9999px` (Pills, avatar icons)

---

## 🧩 4. Component Structure & Hierarchy

```
src/ui/
├── primitives/     # Low-level Radix UI / Atomic controls (button, input, card, dialog, sheet)
├── icons/          # Icon map registry (CategoryIconMap, Lucide icons)
├── layout/         # Application shell (AppShell, Sidebar, BottomNav, HomeWrapper)
└── compositions/   # Feature-level screens (PasswordList, AddEditForm, Settings, ItemDetail)
```

### Component Rules:
1. **Never use ad-hoc colors**: Use Tailwind SDS classes (`bg-[#1a1a2e]`, `bg-[#16213e]`, `text-cyan-400`).
2. **Icons**: Standardize on `lucide-react` icons imported via `@/ui/icons/` or direct Lucide imports.
3. **Mobile First**: All compositions must use flex/grid with touch targets (min 44px) and safe area padding (`pt-[max(env(safe-area-inset-top),_12px)]`).
