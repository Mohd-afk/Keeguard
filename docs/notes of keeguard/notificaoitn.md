# Folder Sharing Workflow — Full Implementation Plan

A comprehensive end-to-end feature for sharing categories (folders) with other users, including role-based access delegation, a rich notification/accept flow, and dynamic "Shared" directory rendering in the sidebar.

---

## Existing Infrastructure (What Already Exists)

> [!NOTE]
> This app already has significant sharing infrastructure built out. The plan is an **extension**, not a rebuild.

| Component | Status |
|---|---|
| `SharedCollection` Firestore data model (`collections/{id}`) | ✅ Exists |
| `CollectionMember`, `CollectionInvite` types | ✅ Exists |
| `CollectionRole` enum (`owner`, `manager`, `editor`, `viewer`) | ✅ Exists |
| `createInvite`, `acceptInvite`, `declineInvite` Cloud Function calls | ✅ Exists |
| `searchUsers` Cloud Function call (debounced in InviteByUsernameInput) | ✅ Exists |
| `InviteByUsernameInput` component with live search + 300ms debounce | ✅ Exists |
| `RoleSelect` component | ✅ Exists |
| `InviteDetailSheet` bottom sheet (Accept/Decline) | ✅ Exists |
| `CollectionAccessPage` – invite form with username search + role + message | ✅ Exists |
| `CollectionListPage` – lists owned/joined collections with creation modal | ✅ Exists |
| `CollectionDetailPage` – items within a collection | ✅ Exists |
| `PendingRequests.tsx` – notification card panel | ✅ Exists |
| `notificationsStore` – real-time Firestore notifications subscription | ✅ Exists |
| `accessStore` – member/invite state management | ✅ Exists |
| Sidebar "Shared Vaults" link → `/collections` | ✅ Exists |

**Conclusion: All backend API calls, Firestore models, and core UX pages already exist.** The task is to wire the **missing UX touchpoints** that would make this feature feel complete and self-discoverable, specifically:

1. **Folder Selection + Share Button** — Categories in PasswordList have no "Share" affordance.
2. **Unified Share Flow** — Right now sharing is only accessible from deep inside `/collections/:id/access`. Users need a direct shortcut from the category/folder level.
3. **Notification Card UX** — The `PendingRequests.tsx` card shows real invites, but the Accept/Decline actions are hidden behind a "Review Invitation" button. They should be inline.
4. **"Shared" Virtual Directory** — The Sidebar has "Shared Vaults" but routes to `/collections` (a flat list). There is no tree-like expansion showing accepted collections as virtual subcategories.

---

## Open Questions

> [!IMPORTANT]
> Please review the following design decision before I start implementation:

**Q1 — Share Target: Categories vs. Collections**
The existing system shares "Collections" (a separate Firestore-native shared folder). Your request says to share "Folders" (which map to the app's custom `CustomCategory` structure stored in user's vault). These are architecturally different:
- **Option A (Recommended):** Keep using the existing `SharedCollection` model. When a user clicks "Share" on a category, the flow creates a **new SharedCollection** named after that category and migrates applicable items into it. This is the secure, zero-knowledge approach.
- **Option B:** Add a separate `category_shares` Firestore collection that tracks ACL per `CustomCategory` ID. This requires a new backend function and data model.

**Q2 — "Viewer" vs. "Collaborator" role names**
Your spec says `viewer` and `collaborator`. The existing system uses `viewer`, `editor`, `manager`, `owner`. Should I rename `editor` → `collaborator` in the UI labels only (keeping the backend value as `editor`), or keep `editor` as-is?

> [!NOTE]
> I will proceed with **Option A** (using existing SharedCollection model) and rename `editor` → `collaborator` in UI labels only, unless you indicate otherwise.

---

## Proposed Changes

### Component 1 — Category Share Trigger (PasswordList + Sidebar)

#### [MODIFY] [PasswordList.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PasswordList.tsx)
- Add a **long-press / context-menu trigger** on category cards in the grid view (or a hover ellipsis `...` on web).
- On activation, show a bottom-sheet action bar with options: **Share**, Rename, Delete.
- "Share" button navigates to `/collections/new?fromCategory={categoryId}&name={categoryName}`.

#### [MODIFY] [Sidebar.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Sidebar.tsx)
- Add a `Share` icon button (small, secondary) inline next to each visible category row — only visible on hover or when long-pressed (matching mobile pattern).
- Tapping it navigates to the same `/collections/new?fromCategory={id}` share flow.
- **"Shared" Accordion** — below the existing "Shared Vaults" row, expand it inline using `subscribeToMyCollections` (already available) to render accepted shared collections as indented child rows, styled as virtual sub-items.

---

### Component 2 — Share Setup Flow (New Page)

#### [NEW] [ShareCategoryPage.tsx](file:///d:/PYTHON/Password%20Manager/src/app/pages/sharing/ShareCategoryPage.tsx)
A dedicated, full-screen sharing setup page, accessed via `/share?collectionId={id}&name={name}`.

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  ← Back   Share "Work Logins"                       │
├─────────────────────────────────────────────────────┤
│  [Search input: "Enter @username"]  🔍              │
│  ─────────────────────────────────────────────────  │
│  RECENT CONNECTIONS                                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ [Avatar] Full Name    @username         [→]  │   │
│  │ [Avatar] Full Name    @username         [→]  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  SEARCH RESULTS (after typing)                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ [Avatar] Full Name    @username         [+]  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

- Uses existing `InviteByUsernameInput` for the search input (300ms debounce already wired).
- On user selection → opens **Permission Bottom Sheet**.
- Reuses existing `RoleSelect` component.
- "Recent Connections" section: fetches the collection's current member list via `subscribeToCollectionMembers`.

**Permission Bottom Sheet (inline or separate component):**
```
┌─ Who can access? ────────────────────────────────── ┐
│ @username — "John Doe"                               │
│                                                      │
│  ○ Viewer       "Can view and download contents."    │
│  ○ Collaborator "Can add, edit, and delete contents."│
│                                                      │
│  [ Optional message... ]                             │
│                                                      │
│           [   Send Request ✉  ]                      │
└──────────────────────────────────────────────────────┘
```

- Maps `viewer` → existing `viewer` role, `collaborator` → existing `editor` role (label-only rename).
- On "Send Request": calls existing `sendInvite()` from `accessStore`. Optimistic UI — close modal immediately, fire `toast.success(...)`.

#### [MODIFY] [routes.ts](file:///d:/PYTHON/Password%20Manager/src/app/routes.ts)
- Add route: `{ path: 'share', Component: ShareCategoryPage }`

---

### Component 3 — Inline Accept/Decline on Notification Cards

#### [MODIFY] [PendingRequests.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PendingRequests.tsx)
The current card shows "Review Invitation →" which opens `InviteDetailSheet`. Enhance:
- Replace the "Review Invitation" link with two **inline action buttons** directly on the card:
  - `[Decline]` — ghost/destructive style
  - `[Accept ✓]` — primary/cyan style
- These call `acceptInvite` / `declineInvite` + `markAsRead` exactly as `InviteDetailSheet` already does.
- Keep `InviteDetailSheet` accessible via a `•••` overflow menu option "View Details" for full metadata.

---

### Component 4 — "Shared" Virtual Directory in Sidebar

#### [MODIFY] [Sidebar.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Sidebar.tsx)
Transform "Shared Vaults" from a simple link into an **expandable tree node**:

```
▾ Shared Vaults  [+]
   ├── Work Passwords    (via John Doe)    [→]
   └── Family Vault      (via Jane Doe)   [→]
```

- Subscribe to `subscribeToMyCollections(user.uid)` inside the Sidebar component.
- Fetch each collection's metadata using the already-implemented `subscribeToSharedCollection`.
- Clicking a child navigates to `/collections/{id}`.
- Clicking `[+]` navigates to `/collections` to create a new one.
- Filter collections to only show those where the current user is **not** the owner (i.e., shared-by-others) — these are the "guest" collections per the spec.
- Owner-collections appear at `/collections` as normal, avoiding duplication.

> [!WARNING]
> The Sidebar doesn't currently have access to the `user` object. We'll need to pass it down from `AppShell` via the `SidebarProps` interface, or read from an auth store singleton.

---

### Component 5 — AppShell Context & Auth Propagation

#### [MODIFY] [AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx)
- Pass `user` prop through to `Sidebar` component (it currently receives `items`, `customCategories`, `onNavigateSettings`, etc.).
- `AppShell` already has `user` from the outlet context so this is a simple prop-threading change.

---

## File Change Summary

| File | Action | Why |
|---|---|---|
| [PasswordList.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PasswordList.tsx) | MODIFY | Add long-press/hover Share trigger on category cards |
| [Sidebar.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Sidebar.tsx) | MODIFY | Expandable "Shared Vaults" tree + per-category share icon |
| [AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx) | MODIFY | Pass `user` prop to Sidebar |
| [PendingRequests.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PendingRequests.tsx) | MODIFY | Add inline Accept/Decline buttons on real invite cards |
| `src/app/pages/sharing/ShareCategoryPage.tsx` | NEW | Dedicated share setup page with user search + permission sheet |
| [routes.ts](file:///d:/PYTHON/Password%20Manager/src/app/routes.ts) | MODIFY | Add `/share` route |
| [RoleSelect.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/collections/RoleSelect.tsx) | MODIFY (minor) | Add `viewer` / `collaborator` UI label aliases |

---

## What We Are NOT Building

The following items from the prompt are already fully implemented and require no code changes:

- **Backend APIs**: All Cloud Functions (`createInvite`, `acceptInvite`, `declineInvite`, `searchUsers`) already exist.
- **Database ACL / pivot table**: The `collections/{id}/members` and `collections/{id}/invites` Firestore schema already implements this.
- **Debounced search**: Already in `InviteByUsernameInput` (300ms debounce).
- **Security middleware**: Already enforced server-side via Cloud Functions + Firestore Security Rules.
- **Notification subscription**: Already in `notificationsStore` with real-time `onSnapshot`.
- **Accept/Decline logic**: Already in `InviteDetailSheet` — we're just surfacing it inline.

---

## Verification Plan

### Automated
- `npm run build` — zero TypeScript errors.

### Manual QA Checklist
1. **Share from Category**: Long-press (or hold) a category in PasswordList → Share action appears → navigates to `ShareCategoryPage`.
2. **User Search**: Type a username → results appear after 300ms debounce → select user → Permission sheet opens.
3. **Send Request (Optimistic)**: Click "Send Request" → modal closes immediately → success toast fires → check Firestore `invites` subcollection for new document.
4. **Recipient Notification**: Sign in as the invited user → check `PendingRequests` → card appears with inline Accept/Decline.
5. **Accept Flow**: Tap "Accept" → `acceptInvite` Cloud Function called → collection appears in the recipient's Sidebar under "Shared Vaults" tree.
6. **Shared Tree**: After acceptance, expand "Shared Vaults" accordion in Sidebar → shared collection appears as child node → tap → navigate to `/collections/{id}`.
7. **Decline Flow**: Tap "Decline" → `declineInvite` called → notification dismissed → badge decrements.
