# 🤖 AGENTS.md — AI Agent Guidance & Context Navigation

> **Unified Entry Point for AI Coding Assistants (Claude, Gemini, Antigravity, Cursor, Codex)**

---

## 📌 Context Loading Rules (Token Optimization Protocol)

Before executing any task, AI agents **MUST** follow this low-token context protocol:

1. **Step 1 — Read the Subsystem Index**:
   - Inspect `.mdfiles/MANIFEST.json` and `.mdfiles/PROJECT_MAP.md`.
   - Match your task target (e.g. `src/app/crypto.ts` or `src/ui/primitives/`) to the mapped subsystem.

2. **Step 2 — Load ONLY Target Code & Specific Documentation**:
   - Load the relevant code files + **ONLY** the single `.md` file mapped to that subsystem (e.g. `.mdfiles/ARCHITECTURE.md` or `.mdfiles/DESIGN.md`).
   - **DO NOT** read all `.md` files in `.mdfiles/` before coding.

3. **Step 3 — Abide by Ponytail Optimization Guidelines (`.mdfiles/RULES.md`)**:
   - Check the Decision Ladder: `YAGNI` → `REUSE` → `STD LIB` → `EXISTING DEP` → `ONE-LINER` → `MINIMAL`.
   - Never duplicate Firestore path builders.
   - Use `@/app` and `@/ui` path aliases — relative paths (`../`) are banned in `src/ui/compositions/`.

4. **Step 4 — Verify Documentation Freshness**:
   - Run `npm run doc:check` before committing to verify if your code changes require updating any mapped `.mdfiles/*.md` documentation.

---

## 🧭 Source of Truth Hierarchy

1. **Source Code & `firestore.rules`** = Authoritative implementation behavior.
2. **`.mdfiles/PRD.md`** = Authoritative product requirements.
3. **`.mdfiles/ARCHITECTURE.md` & `.mdfiles/RULES.md`** = Authoritative architectural boundaries & workflow rules.
4. **`.mdfiles/MANIFEST.json` & `.mdfiles/PROJECT_MAP.md`** = Navigation & indexing metadata.
