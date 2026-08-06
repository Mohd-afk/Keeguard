# 🔐 SecureVault — Complete App Audit Guide

> Your stack: **React 18 + Vite + Capacitor (Android) + Firebase (Firestore + Auth) + TypeScript**  
> Cryptography: `hash-wasm`, `crypto.ts`, `secureMemory.ts`  
> OTA: `@capgo/capacitor-updater`

---

## 🚨 Critical Issues I Already Spotted (Right Now, For Free)

Before diving into audit methods, here are **real issues I found in your code in 2 minutes**:

### 1. 🔴 Firebase Admin SDK JSON is in your repo root
`vault-app-ba6e2-firebase-adminsdk-fbsvc-6c4a261f81.json` exists in your project folder.  
Even though it's in `.gitignore`, if it was ever committed even once, it's in git history.

**Action:** Run `git log --all --full-history -- "*firebase-adminsdk*"` to check.  
If it was committed, rotate your service account key in Firebase Console **immediately**.

### 2. 🔴 `firebase-admin` is in `dependencies` (not devDependencies)
Firebase Admin SDK (`"firebase-admin": "^13.7.0"`) should **never** run in a browser/client app.  
Having it in `dependencies` means it's bundled into your app — Admin SDK contains server-only privileges.

### 3. 🟡 Firestore Rule: `registered_emails` is fully public
```
match /registered_emails/{hash} {
  allow get: if true;  // ← Anyone unauthenticated can read this
```
Email existence enumeration is possible if hashes are weak (MD5/SHA1).

### 4. 🟡 `app_config` is fully public
```
match /app_config/{document=**} {
  allow read: if true;  // ← Anyone can read your app config
```
If you store any internal config (feature flags, API keys, server URLs) here — it's exposed.

### 5. 🟡 Collection Members: Overly broad write rule
```
allow write: if isSignedIn() && (isActiveMember(collectionId) || request.auth.uid == userId);
```
Any signed-in user can write their own member document into a collection they aren't invited to, potentially self-assigning roles.

### 6. 🟡 OTA Updates — no integrity check visible
`@capgo/capacitor-updater` does OTA pushes. Verify that bundle signing/verification is configured — malicious bundles could replace your app.

---

## 🧭 What Areas to Audit

| Layer | What to Check |
|---|---|
| **Security** | Auth, encryption, Firestore rules, secrets in code, API exposure |
| **Cryptography** | Key derivation, encryption algo, IV reuse, key storage |
| **Backend / Firebase** | Rules, indexes, functions, Admin SDK usage |
| **Frontend Code** | XSS, sensitive data in state/logs, memory leaks |
| **UI / UX** | Flow, accessibility, mobile usability, edge cases |
| **Performance** | Bundle size, load time, IndexedDB usage, re-renders |
| **Dependencies** | Outdated/vulnerable packages, license issues |
| **Android / Capacitor** | Permissions, WebView hardening, backup settings |
| **OTA / Release** | Bundle integrity, rollback, version management |

---

## 🤖 Option 1: AI-Assisted Audit (Free & Most Practical For You)

### A. Use **Me (Antigravity / Gemini)** — You're Already Doing This ✅

I can read every file in your codebase and give you a line-by-line audit. **This is completely free.**

**How to do it — just ask me:**
- `"Audit my crypto.ts for security issues"`
- `"Review my firestore.rules for privilege escalation"`  
- `"Check my store.ts for sensitive data leaks in logs"`
- `"Audit my android/ folder for insecure WebView settings"`
- `"Scan all my source files for hardcoded secrets or API keys"`
- `"Review my auth.ts for authentication weaknesses"`

I'll go through every line and report findings. This is the **best free option** for code-level security.

### B. **GitHub Copilot** (if you use VS Code)
- Free tier available
- Can explain and critique code inline
- Less thorough than a dedicated session with me

### C. **ChatGPT / Claude** (Free tiers)
- Paste specific files for review
- Limited context window — can't review all 68KB of `store.ts` at once
- Less integrated than me (no file access)

### D. **Google Gemini Code Assist** (Free in VS Code)
- Install the extension, uses your Google account
- Can review open files inline

---

## 🛠️ Option 2: Automated Static Analysis Tools (Free)

### Security Scanning

| Tool | What it finds | Cost |
|---|---|---|
| **`npm audit`** | Vulnerable npm packages | Free, run now |
| **Semgrep** | Security patterns in JS/TS | Free OSS tier |
| **Snyk** | Vuln deps + code issues | Free for 1 dev |
| **ESLint + plugins** | Code quality + security rules | Free |
| **Retire.js** | Outdated/vulnerable JS libs | Free |
| **OWASP ZAP** | Web app dynamic scanning | Free |

**Run right now:**
```bash
npm audit
npx semgrep --config=auto src/
```

### Firebase Specific

| Tool | What it finds | Cost |
|---|---|---|
| **Firebase Rules Playground** | Test your Firestore rules | Free (in Firebase Console) |
| **`firebase-tools` emulator** | Simulate rule violations | Free |
| **firestore-jest-mock** | Unit test your rules | Free |

### Android Security

| Tool | What it finds | Cost |
|---|---|---|
| **MobSF (Mobile Security Framework)** | APK static + dynamic analysis | Free, self-hosted |
| **apktool** | Decompile APK, check configs | Free |
| **Drozer** | Runtime attack simulation | Free |

---

## 💼 Option 3: Hire Someone (When & How)

### When to hire:
- You're launching to real users with sensitive data
- You've exhausted free options
- You need a "penetration test" certificate for compliance

### Where to hire:

**Freelance Platforms:**
| Platform | Cost Range | Notes |
|---|---|---|
| **Fiverr** | $50–$500 | Hit or miss quality, good for basic audits |
| **Upwork** | $50–$200/hr | Better quality, filter for "Firebase security" or "mobile pentest" |
| **Toptal** | $150–$300/hr | Top 3% developers, very expensive |
| **YesWeHack / HackerOne** | Bug bounty model | Pay only if they find bugs |

**Specialized Security Firms:**
| Type | Cost Range | Notes |
|---|---|---|
| Boutique pentest firm | $3,000–$15,000 | Full audit + report |
| Big4 (Deloitte/PwC/KPMG) | $20,000+ | Overkill unless enterprise |
| Firebase/Google Certified Partner | $1,000–$5,000 | Firebase-specific expertise |

**What to ask for:**
- "Firebase Firestore rules security review"
- "React SPA security audit"
- "Android Capacitor app penetration test"
- "Cryptographic implementation review"

### What to give them:
- Access to your repo (private, with NDA)
- Firebase project access (read-only service account)
- Your threat model (what are you protecting?)

---

## 🆓 Option 4: Free Community Reviews

### Reddit:
- `r/netsec` — post your Firestore rules for community review
- `r/webdev` — UI/UX and code quality feedback
- `r/reactjs` — React-specific code review

### GitHub:
- Make your repo public temporarily and create a "Security Review" issue
- Use `SECURITY.md` to invite responsible disclosure

### Discord Communities:
- **Firebase community Discord** — rules experts hang out here
- **Reactiflux** — React security and code review
- **OWASP Discord** — security-focused, mobile/web

---

## 📋 Audit Checklist You Can Do Right Now (With Me)

### 🔐 Security (Priority 1)
- [ ] Run `npm audit` — check for known vulnerabilities
- [ ] Review `crypto.ts` — key derivation, IV handling, algorithm choices
- [ ] Review `secureMemory.ts` — does it actually zero memory?
- [ ] Review `auth.ts` — session handling, token storage, logout
- [ ] Review `firebase.ts` — is the config safe to expose? (it is, but check)
- [ ] Review `store.ts` — is plaintext password data ever in app state?
- [ ] Review `.env` — are any **server-side** secrets in there?
- [ ] Check Android `network_security_config.xml` — cleartext traffic?
- [ ] Check `capacitor.config.ts` — WebView settings, allowNavigation

### 🗄️ Database / Backend (Priority 2)
- [ ] Firestore rules — privilege escalation scenarios
- [ ] `firestore.indexes.json` — over-indexed or missing indexes?
- [ ] Cloud Functions (if any) — input validation, auth checks
- [ ] Admin SDK usage — is it only server-side?

### 🎨 UI/UX (Priority 3)
- [ ] Password visibility toggle — accessible?
- [ ] Error messages — do they leak info? ("Wrong password" vs "No account found")
- [ ] Clipboard — is it cleared after auto-copy?
- [ ] Mobile — does the keyboard obscure inputs?
- [ ] Offline state — does the app behave gracefully?
- [ ] Logout flow — is everything wiped from memory/storage?

### 📦 Dependencies (Priority 4)
- [ ] `npm audit` results reviewed and fixed
- [ ] `@xenova/transformers` — why is a 100MB+ ML library in a password manager?
- [ ] `firebase-admin` moved to server-only, not bundled in client
- [ ] All packages pinned (not `^` ranges) for production

### 🤖 Android / Capacitor (Priority 5)
- [ ] `android:allowBackup` — should be `false` for a password manager
- [ ] `android:debuggable` — must be `false` in release builds
- [ ] Screenshot prevention (`FLAG_SECURE`) on all screens
- [ ] Root detection implemented?
- [ ] Screen overlay attack prevention?

---

## 🗺️ My Recommended Audit Plan For You

### Phase 1 — This Week (Free, With Me)
1. Ask me: `"Audit my crypto.ts"` → I'll review every line
2. Ask me: `"Audit my store.ts for data leaks"` → Largest file, highest risk
3. Ask me: `"Audit my android folder and capacitor config"`
4. Run `npm audit` and paste results to me
5. Fix the 6 issues I already found above

### Phase 2 — This Month (Free Tools)
1. Run MobSF on your APK
2. Run Semgrep on your `src/`
3. Post your Firestore rules on Firebase Discord for community review
4. Use Firebase Rules Playground to test edge cases

### Phase 3 — Before Production Launch (Consider Hiring)
1. Hire a Firebase specialist on Upwork ($200–500) just for rules + crypto review
2. Consider a bug bounty program (HackerOne has a free tier)
3. Get your `crypto.ts` reviewed by a cryptographer

---

## 💡 On Perplexity's "Computer" Feature

You're right that Perplexity's autonomous computer-use feature is paid. But you don't need it —  
**I can read your actual files directly**, which is more thorough than a web-browsing AI anyway.  
Perplexity Computer would browse the web *about* security — I can read your *actual code*.

---

## 📊 Cost Summary

| Method | Cost | Depth | Best For |
|---|---|---|---|
| Me (Antigravity) | **Free** | Very deep — reads all files | Code + security |
| `npm audit` | **Free** | Deps only | Quick wins |
| Semgrep | **Free** | Pattern matching | Security patterns |
| MobSF | **Free** | Android APK | Mobile security |
| Community (Discord/Reddit) | **Free** | Varies | Sanity check |
| Upwork freelancer | $200–$1000 | Good | Firebase/crypto focus |
| Pentest firm | $3,000–$15,000 | Comprehensive | Pre-launch |

> [!TIP]
> Start with me. I can audit every file in your project at zero cost. Just say: **"Start the security audit"** and I'll go file by file through your entire codebase and produce a findings report.

> [!WARNING]
> Fix the Firebase Admin SDK in `dependencies` and rotate your service account key before anything else. These are your two most urgent issues right now.
