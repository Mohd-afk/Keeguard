<!-- PURPOSE: Overview documentation detailing project features, zero-knowledge architecture, and dev commands. -->

# 🔐 KeeGuard (SecureVault) — Zero-Knowledge Password Manager

> **Your personal, ultra-secure password vault across Android, Web, and Desktop Browsers.**  
> *100% Zero-Knowledge Encryption • Native Android Autofill Service • Chrome / Edge Extension • Completely Free for Everyone*

---

## 🌟 What is KeeGuard? (Project Purpose)

**KeeGuard** is a modern, privacy-first password manager built to protect your online identity, login credentials, payment details, multi-factor authentication (2FA) tokens, and private notes. 

In today's digital world, reusing passwords across websites is one of the single biggest security risks. KeeGuard enables you to generate strong, unique passwords for every account and store them inside a client-side encrypted vault. 

**The Golden Rule of KeeGuard: Zero-Knowledge Security.**  
KeeGuard is engineered so that **only you** hold the master key to your data. Your Master Password is used to encrypt your vault directly on your own device using hardware-backed cryptographic primitives before anything ever touches the cloud. Even if someone intercepts your database or gains full access to the cloud server, all they see is unreadable, scrambled gibberish (`ciphertext`). Neither server administrators nor third parties can ever access or read your passwords.

---

## ✨ Key Benefits

- 🛡️ **True Zero-Knowledge Encryption**: Powered by industry-standard **AES-256-GCM** encryption and **Argon2id** key derivation. Your secret keys remain strictly in your device's RAM and are scrubbed after use.
- 📱 **Native Android Autofill Service**: Log in to your mobile apps (such as Instagram, banking apps, or shopping apps) with a single tap using Android's native autofill system, protected by fingerprint or face unlock.
- 🌐 **Browser Extension (Chrome & Edge)**: Effortlessly autofill login credentials and save new accounts as you browse the web on desktop computers.
- 🔄 **Real-Time Cross-Platform Sync**: Any change made on your mobile phone automatically syncs across your web app and desktop extension within seconds.
- 🔍 **Dark Web & Leak Detection**: Integrated breach check (via *Have I Been Pwned* k-anonymity API) alerts you if an account was compromised in a public data breach without ever revealing your actual passwords.
- 🔑 **Built-In 2FA Authenticator**: Store Time-based One-Time Passwords (TOTP / 2FA codes) inside your vault, eliminating the need for separate authenticator applications.
- 🎨 **Sleek & Intuitive Interface**: Modern, dark-mode design that is effortless to use for everyone—from beginners to tech enthusiasts.

---

## 🎓 Pricing, Hosting & Capacity Information

### 🚀 Ready-to-Use for End-Users & Students ($0 Cost)
- **Zero Setup Required**: End-users and students **do NOT need to host anything, set up a server, or configure a database**. 
- Simply open the hosted web application link or install the Android APK and Browser Extension to start using KeeGuard immediately for **100% free**.

### ☁️ Infrastructure & Free Tier Capacity
The core application is hosted on **Vercel** (for web application delivery and serverless API endpoints) and **Google Firebase** (for cloud authentication and real-time database synchronization). 

Using Firebase's free **Spark Plan** and Vercel's free hobby tier:
- **Authentication Capacity**: Supports up to **50,000 monthly active users (MAU)** for free.
- **Database Storage & Throughput**: Includes **1 GB of stored Firestore data**, 50,000 daily read operations, and 20,000 daily write operations.
- **User Hosting Capacity**: Because KeeGuard stores lightweight, client-side encrypted vault payloads (~10 KB to 50 KB per user profile), the free Spark tier comfortably hosts **20,000 to 50,000+ active users** with **$0 in monthly server costs**.

> [!NOTE]  
> **Optional Self-Hosting**: While regular users can use the hosted service instantly, developers or institutions who wish to run their own private instance can fork this open-source repository and deploy it to their own free Vercel and Firebase accounts.

---

## 🗄️ How Your Data is Stored (Database Description)

KeeGuard uses a multi-layered storage architecture to ensure maximum performance, offline access, and total privacy:

1. **Cloud Sync Database (Google Cloud Firestore)**  
   - Stores your vault in the cloud so your mobile devices, web browsers, and desktop extensions stay synchronized.
   - **Privacy Guarantee**: All vault records stored in the cloud are encrypted into unreadable scrambled text (`ciphertext`) *before* transmission. The cloud database holds zero readable passwords or keys.

2. **Android Native Local Database (SQLCipher)**  
   - On Android devices, KeeGuard utilizes **SQLCipher**, an enterprise-grade SQLite database encrypted with 256-bit AES encryption.
   - Enables native Android autofill to work instantly and securely offline without needing an active internet connection.

3. **Browser Local Storage (IndexedDB & Session Storage)**  
   - Browsers cache encrypted vault records in IndexedDB for instant loading and offline availability.
   - Decryption keys are stored strictly in temporary session memory (`chrome.storage.session`) and are automatically destroyed when you close your browser or lock the vault.

---
---

## 🚀 How to Run & Use KeeGuard

### 1. Using the Hosted Web Application
- Simply visit the hosted web application URL in any modern browser (Chrome, Safari, Firefox, Edge, Brave).
- Create your account and Master Password to begin using your vault immediately.

### 2. Running the Web Application Locally (For Developers)
1. Ensure you have **Node.js** (v18 or higher) installed on your system.
2. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite local development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

### 3. Setting Up the Desktop Browser Extension
1. Open Google Chrome, Brave, or Microsoft Edge.
2. Navigate to `chrome://extensions/` in your address bar.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `extension/` folder inside this repository.
5. Click on the KeeGuard icon in your browser toolbar to log in and unlock your vault.

---

## 📘 Complete User Guide & Step-by-Step Installation

For a complete step-by-step guide on how to download, install, and configure KeeGuard across Android mobile devices, browser extensions, and web apps, refer to our official **[USERGUIDE.md](USERGUIDE.md)**:

👉 **[Open Complete User Guide (USERGUIDE.md)](USERGUIDE.md)**  
👉 **[View Online on GitHub Releases](https://github.com/Mohd-afk/apk-releases/blob/main/USERGUIDE.md)**

### Guide Highlights:
- 📱 **[Android APK Sideloading Guide](USERGUIDE.md#1-installing-the-android-apk-on-mobile)** — Enabling unknown sources, Play Protect bypass, and Android System Autofill setup.
- 🧩 **[Browser Extension Setup Guide](USERGUIDE.md#2-installing-the-browser-extension)** — Enabling Developer Mode and loading unpacked extensions in Chrome/Edge/Brave.
- 🌐 **[Web Application & Vault Guide](USERGUIDE.md#3-using-the-web-applications)** — Master password creation, zero-knowledge encryption, and cross-device sync.
- 🛠️ **[Troubleshooting & FAQ](USERGUIDE.md#4-troubleshooting--faq)** — Solutions for parse errors, Play Protect warnings, and update procedures.

---

## 📱 Android APK Installation Note

> [!IMPORTANT]  
> **Play Store Notice**: KeeGuard is currently **not published on the Google Play Store**. The Android application is distributed directly as an APK file through GitHub Releases and self-hosted direct downloads.

### Quick APK Installation Overview:
1. Download the latest `.apk` installer file from [GitHub Releases](https://github.com/Mohd-afk/apk-releases/releases).
2. Open the downloaded file on your Android phone.
3. If prompted by Android, grant permission to **"Install from Unknown Sources"** or **"Allow installation from this source"**.
4. Tap **Install** (and select **"Install anyway"** if Play Protect prompts).
5. Open KeeGuard, log in, and enable **Autofill Service** in Android settings.
6. For detailed screenshots and visual flowcharts, see the **[Mobile Installation Guide in USERGUIDE.md](USERGUIDE.md#1-installing-the-android-apk-on-mobile)**.

---

## 🧩 Browser Extension Features

The KeeGuard Web Extension (`/extension`) delivers seamless desktop integration:
- **Instant In-Page Autofill**: Automatically detects login forms on any website and fills your username and password with one click.
- **Save New Logins**: Automatically prompts you to save newly created passwords directly to your vault.
- **Isolated Key Derivation**: Cryptographic operations run in an isolated offscreen document background environment to keep your master password and keys completely safe while browsing.

---

## 📁 Full Directory & Codebase Structure

Below is the complete architectural directory tree mapping out every subsystem, module, and file group in the project:

```text
Password Manager/
├── .mdfiles/                                 # Project Documentation & Architecture Governance
│   ├── ARCHITECTURE.md                       # Cryptographic & System Architecture Specifications
│   ├── AUTOFILL_ARCHITECTURE.md              # Android Native Autofill Engine Documentation
│   ├── DESIGN.md                             # Figma SDS UI Design System Guidelines
│   ├── FEATURES.md                           # Core Vault Features & Specifications
│   ├── MANIFEST.json                         # Documentation Mapping & Drift Control Manifest
│   ├── PROJECT_MAP.md                        # Codebase Subsystem & Entrypoint Navigation Map
│   ├── PRD.md                                # Product Requirements Document
│   ├── RELEASES.md                           # Self-Hosted OTA Deployment Guidelines
│   ├── RULES.md                              # Developer Protocol & Coding Standards
│   └── SECURITY_AUDIT.md                     # Security Threat Model & Audit Log
│
├── android/                                  # Native Android Application (Capacitor + Kotlin)
│   └── app/src/main/java/com/mohdj/securevault/
│       ├── MainActivity.kt                   # Main Android Entry Point
│       ├── autofill/                         # Android Native Autofill Service Engine
│       │   ├── SecureVaultAutofillService.kt # Core Autofill Provider Service
│       │   ├── CredentialDeliveryActivity.kt # Native Credential Delivery Dialog
│       │   ├── DomainMatcher.kt              # Domain Trust & Subdomain Matching Engine
│       │   ├── UnlockVaultActivity.kt        # In-Line Biometric Vault Unlock Screen
│       │   ├── classifier/                   # Heuristic Form Field Classifiers
│       │   ├── parser/                       # Android ViewNode Structure Parsers
│       │   └── suggestion/                   # Dataset Builder & Presentation Suggestions
│       ├── bridge/                           # Capacitor JS-to-Native Bridge Plugins
│       │   ├── VaultBridgePlugin.kt          # Vault Storage & Encryption Bridge
│       │   ├── AutofillBridgePlugin.kt       # Autofill State & Dataset Bridge
│       │   ├── BiometricBridgePlugin.kt      # Android Keystore & Fingerprint Bridge
│       │   └── CategorySyncBridgePlugin.kt   # Shared Category Sync Bridge
│       ├── security/                         # Mobile Hardware Security & Key Wrapping
│       │   ├── BiometricKeyManager.kt        # Android Keystore Hardware TEE/StrongBox Key Handler
│       │   ├── DatabaseKeyManager.kt         # SQLCipher Passphrase Encrypted Storage
│       │   └── BiometricVaultUnlocker.kt     # Biometric Prompt Wrapper
│       └── vault/                            # Native SQLCipher Encrypted SQLite Database
│           ├── NativeVaultDatabase.kt        # Room Database Definition
│           ├── VaultDao.kt                   # Data Access Objects (CRUD)
│           ├── VaultItemEntity.kt            # Local Vault Table Schema
│           └── VaultRepository.kt            # Repository Access Layer
│
├── api/                                      # Serverless Backend Endpoints (Vercel Node)
│   ├── hello-admin.ts                        # Serverless Token Verification & Admin Handler
│   └── lib/
│       └── firebase-admin.ts                 # Firebase Admin SDK Serverless Initializer
│
├── extension/                                # Desktop Browser Extension (Manifest V3)
│   ├── manifest.json                         # Web Extension Manifest (Chrome / Edge / Brave)
│   ├── background/                           # Background Service Worker Engine
│   │   ├── service-worker.js                 # Event Bus, Alarm Sync & Chrome Messaging
│   │   ├── vault-crypto.js                   # Web Crypto AES-256-GCM Encryption Routines
│   │   ├── sync-engine.js                    # Firestore REST API Real-Time Sync Engine
│   │   └── firebase-init.js                  # Firebase Client REST Config
│   ├── content/                              # In-Page Content Script & Form Fill Engine
│   │   ├── content.js                        # Page DOM Event Listener
│   │   ├── fill-engine.js                    # DOM Field Filler & Password Inserter
│   │   ├── field-classifier.js               # In-Page Form Input Classifier
│   │   ├── form-detector.js                  # Dynamic DOM Login Form Observer
│   │   ├── overlay.js                        # Floating Quick-Fill Dropdown Overlay
│   │   └── save-detector.js                  # New Credentials Save Prompt Listener
│   ├── offscreen/                            # Sandboxed Offscreen Execution Context
│   │   ├── offscreen.html                    # Isolated DOM Document for WASM
│   │   └── offscreen.js                      # Argon2id WebAssembly Key Derivation Worker
│   └── popup/                                # Extension Popup User Interface
│       ├── popup.html                        # Popup DOM Markup
│       ├── popup.js                          # Popup Application Logic & Vault Views
│       └── popup.css                         # Extension Styling & Dark Theme
│
├── functions/                                # Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── index.ts                          # Cloud Function Triggers & HTTP Endpoints
│       ├── models/                           # Function Data Interfaces
│       ├── routes/                           # API Route Definitions
│       └── services/                         # Backend Business Services
│
├── public/                                   # Static Assets & Web App Favicons
│   ├── favicon.svg                           # Application Icon
│   └── manifest.json                         # Web App Manifest (PWA)
│
├── scripts/                                  # Automation, Release & Maintenance Tools
│   ├── release-ota.mjs                       # Self-Hosted Web OTA Zip Bundler
│   ├── verify-docs.mjs                       # Automated Documentation Freshness Checker
│   ├── set-ota-version.mjs                   # Package & App Version Bumper
│   ├── update-apk-firestore.mjs              # Android APK Version Publisher
│   └── export-user-emails.mjs                # Firebase Auth User Audit Tool
│
├── src/                                      # Main Web Application Source Code
│   ├── main.tsx                              # Vite App Entry Point & React Root
│   ├── app/                                  # State Management & Core Business Logic
│   │   ├── App.tsx                           # Main React Layout Shell & Auth Router
│   │   ├── store.ts                          # Central Reactive State Store (CRUD, Sync, Master Key)
│   │   ├── crypto.ts                         # Argon2id WASM Key Derivation & AES-256-GCM Engine
│   │   ├── firestore.ts                      # Cloud Firestore Real-Time Subscriptions
│   │   ├── auth.ts                           # Firebase Auth Authentication Handler
│   │   ├── idb.ts                            # Async IndexedDB Local Storage Wrapper
│   │   ├── secureMemory.ts                   # Sensitive Uint8Array Byte Buffer Zeroing (`scrub()`)
│   │   ├── routes.ts                         # Navigation Routes & View Constants
│   │   ├── services/                         # Background App Services
│   │   │   ├── updater.ts                    # Self-Hosted OTA Update Checker
│   │   │   ├── deviceSession.ts              # Device Session Tracking & IP Geolocation
│   │   │   └── hibpCache.ts                  # Have I Been Pwned k-Anonymity Leak Checker
│   │   └── stores/                           # Modular Sub-State Stores
│   ├── tokens/                               # Design System Tokens
│   │   ├── colors.ts                         # Dark Mode Cyan & Accent Palette Tokens
│   │   ├── spacing.ts                        # UI Scale & Border Radii Definitions
│   │   └── typography.ts                     # Inter & JetBrains Mono Font Definitions
│   └── ui/                                   # Figma SDS Component System
│       ├── primitives/                       # 47 Atomic UI Components (Button, Card, Dialog, Input, etc.)
│       └── compositions/                     # 24 Complete Screen Views & Feature Modules
│           ├── AuthScreen.tsx                # Login, Signup & Master Password Screen
│           ├── PasswordList.tsx              # Main Vault Item List, Search & Filters
│           ├── AddEditForm.tsx               # Add/Edit Password & Secret Record Sheet
│           ├── ItemDetail.tsx                # Item View, Reveal Password & TOTP Code Generator
│           ├── Settings.tsx                  # User Settings, Backup/Restore & Security Controls
│           ├── SecurityDashboard.tsx         # Password Health Score & Breach Audit Screen
│           ├── ManageCategories.tsx          # Shared Vault Category Access & ECDH Management
│           ├── ManageProfiles.tsx            # Custom Autofill Identity Profile Editor
│           ├── LockScreen.tsx                # Quick Master Password / PIN Unlock Screen
│           └── TrashBin.tsx                  # Soft-Deleted Items Recovery Bin
│
├── capacitor.config.ts                       # Capacitor Mobile Cross-Platform Configuration
├── firebase.json                             # Firebase Hosting, Firestore & Functions Config
├── firestore.rules                           # Cloud Firestore Security Rules (Zero-Knowledge Enforced)
├── firestore.indexes.json                    # Firestore Indexing Definitions
├── package.json                              # Project Dependencies & Build Scripts
└── vite.config.ts                            # Vite Bundler & PWA Plugins Configuration
```


## 🛡️ License & Open Source

KeeGuard is open-source software provided under the MIT License. Feel free to inspect, fork, and contribute!