# 🐴 PONYTAIL — Keeguard AI Agent Rules
> *"The best code is the code you never wrote."*
> Inspired by [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)

These rules govern how **Antigravity (AI)** should behave when working on the Keeguard codebase.
The goal is to act like the **laziest senior developer in the room** — not because we are careless,
but because we have enough experience to know that less code is almost always better code.

---

## 🧠 The Decision Ladder

Before writing **any** new code, the AI **must** work through this ladder from top to bottom.
Only move to the next step if the current one cannot solve the problem.

```
1. YAGNI        → Does this feature/fix actually need to exist?
2. REUSE        → Is there already a helper, hook, util, or store in this codebase that does it?
3. STD LIBRARY  → Can the native platform API (Web Crypto, IDB, Fetch, etc.) solve this directly?
4. EXISTING DEP → Can a library already installed in package.json handle it?
5. ONE-LINER    → Can this be written in a single expression or line?
6. MINIMAL      → Only then: write the smallest possible implementation.
```

**Hard stops — NEVER compromise on:**
- 🔐 Encryption correctness (AES-GCM, ECDH key derivation)
- 🔒 Auth gating and Firestore security rules
- ✅ Input validation before any database write
- ♿ Accessibility on UI elements

---

## 🔥 Rules for This Codebase

### General
- **Never duplicate a Firestore path.** All paths live in ref-builder functions. If you need a
  new path, add one ref-builder — do not inline `doc(db, 'x', id)` in a function body.
- **Never add a new npm dependency** for something the platform already does. (`crypto.subtle`
  is available; no `bcrypt` npm package needed.)
- **Never copy-paste a pattern more than once.** If you see a second use for the same 3+ line
  block, stop and extract a helper first.
- **Prefer `async/await` over raw Promises.** Raw Promise chains are permitted only in `idb.ts`
  where the IndexedDB API requires event-based callbacks.

### Database Layer (`src/app/firestore*.ts`, `src/app/idb.ts`)
- Use `getDocOrNull<T>()` from `firestore/helpers.ts` for every single-document read.
- Use `snapsToDocs<T>()` from `firestore/helpers.ts` for every query result mapping.
- Use `snapshotWith()` / `querySnapshotWith()` for every `onSnapshot` subscription.
- **Never open `IndexedDB` more than once per session.** Use the cached `_dbPromise` in `idb.ts`.
- **Never inline `serverTimestamp()`** without an `updatedAt` field on the same write.
- Batch writes for any operation that touches more than one document.

### State / Store (`src/app/store.ts`, `src/app/stores/`)
- Do not duplicate state that is already in another store. Check all stores before adding a field.
- Derive values with `useMemo`/computed instead of storing them separately when possible.
- Do not create a new store for data already in `store.ts` unless there is a clear
  separation-of-concerns reason.

### Components (`src/app/components/`, `src/app/pages/`)
- Check `src/app/components/` for an existing component before building a new one.
- Do not build a custom date picker, toggle, modal, or tooltip — use existing UI primitives.
- Inline styles are banned. All styling goes through existing CSS variables or class utilities.
- Never import a UI library that is not already in `package.json`.

### Crypto (`src/app/crypto.ts`, `src/app/crypto/`)
- Do not change the encryption algorithm or key derivation without a security audit entry in
  `docs/` and explicit user approval.
- Reuse the existing `deriveKey`, `encryptPayload`, `decryptPayload` functions.
  Do NOT copy their internals into other files.

---

## 🚫 Anti-Patterns (banned in this project)

| Anti-pattern | Instead |
|---|---|
| Repeating `snap.exists()` inline | Use `getDocOrNull()` |
| `docs.map(d => ({ id: d.id, ...d.data() }))` inline | Use `snapsToDocs()` |
| Copy-pasting `onSnapshot(q, cb, err => log.error)` | Use `querySnapshotWith()` |
| `openDB()` inside every IDB function | Use the shared `_dbPromise` |
| `any` type on Firestore reads | Use the typed interfaces in `collections.ts` |
| Dynamic `import()` of already-imported modules | Move import to the top of the file |
| Dead code (unused refs, unused exports) | Delete it, do not comment it out |
| `console.log` directly | Use `createLogger()` from `utils/logger` |

---

## ✅ When You SHOULD Write New Code

- A required feature genuinely does not exist yet in the codebase.
- A bug is caused by existing code that must be corrected.
- A security vulnerability needs patching.
- Performance is measurably degraded and profiling confirms it.
- A helper would be used **3 or more times** (rule of three).

---

## 📐 Size Limits (soft guidelines)

| Unit | Max lines | Action if exceeded |
|---|---|---|
| A single exported function | 30 | Split or extract sub-functions |
| A Firestore data module | 200 | Split by concern into sub-files |
| A React component | 250 | Extract child components |
| `store.ts` | 800 | Move slice to `stores/` sub-file |

---

## 🔄 Refactor Checklist (run before any PR)

- [ ] Did I check the ladder before writing new code?
- [ ] Did I check for an existing helper/util/component first?
- [ ] Is every new pattern used at least 3 times? (Otherwise inline it)
- [ ] Did I remove any dead code I encountered?
- [ ] Does `npm run build` pass with 0 TypeScript errors?
- [ ] Did I avoid adding any new `npm` dependencies?

---

*Last updated: 2026-07-23 — Applied to: database layer audit (firestore.ts, collections.ts, invites.ts, notifications.ts, idb.ts)*
