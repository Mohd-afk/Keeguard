# 🧠 Keeguard — AI Memory & Tracking Roadmap

> **Self-Tracking Memory Log for Antigravity AI Agent**  
> *Ultra-dense bullet point reference for recent updates, strict rules, and roadmap tasks.*

---

## 📌 Global & Strict Rules
- **Ponytail Rule**: Write less code, optimize existing code, avoid duplicate helpers/stores.
- **Path Aliases**: Enforce `@/app` & `@/ui` aliases across all compositions. Zero relative (`../`) imports in `src/ui/compositions/`.
- **OTA Release**: Always run `git push origin main` immediately after `npm run release`.
- **APK Release**: Always bump `package.json` version and `build.gradle` `versionCode` before building APKs.
- **Crypto Rules**: AES-256-GCM + Argon2id WASM key derivation. Never break backward compatibility.

---

## 🚀 Major Updates & Recent Changes
- **Figma SDS Migration**: Full refactor to atomic-modular structure (`src/ui/primitives`, `compositions`, `layout`, `tokens`).
- **Path Alias Cleanup**: 100% of relative path imports in `src/ui/compositions/` replaced with `@/app` and `@/ui`.
- **Build & Verification**: Zero TypeScript errors (`npx tsc --noEmit`) and verified Vite production build.
- **Android Native Fixes**: Biometric unlock setting preservation across logouts, native Google Auth plugin config.
- **OTA Stability**: 3-state bundle validation (`sv_ota_pending_version`, `sv_ota_pending_bundle_id`, `sv_ota_active_version`) with unhashed stable asset paths.
- **Zero-Knowledge Sharing**: ECDH key exchange & encrypted envelope re-wrapping for group categories.

---

## 🗺️ Project Memory & Tracking Roadmap

- [x] Refactor UI codebase to Figma Simple Design System (SDS).
- [x] Standardize `@/app` and `@/ui` path aliases across all compositions.
- [x] Resolve all TypeScript compilation & Vite bundle build errors.
- [x] Create and update project documentation files inside `.mdfiles/` (`prd.md`, `features.md`, `architecture.md`, `rules.md`, `design.md`, `memory.md`).
- [ ] Maintain 0-error build state on all subsequent commits.
- [ ] Trigger OTA release pipeline on next production update.
