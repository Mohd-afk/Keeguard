// PURPOSE: Initializes Firebase Web SDK application singleton and exposes auth and database instances.
/**
 * Firebase Client SDK Initialization Module
 * Provides lazy, idempotent initialization of Firebase App, Auth (with IndexedDB persistence on native Android), Firestore, and Functions.
 */

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
    getAuth,
    initializeAuth,
    indexedDBLocalPersistence,
    type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';

// ── Module-level holders (populated after initFirebase()) ────────────

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;
let _initialized = false;

// ── Lazy getters ─────────────────────────────────────────────────────
// These throw clearly if accessed before initFirebase() is called.

export function getFirebaseApp(): FirebaseApp {
    if (!_app) throw new Error('[Firebase] App not initialized. Call initFirebase() first.');
    return _app;
}

export function getFirebaseAuth(): Auth {
    if (!_auth) throw new Error('[Firebase] Auth not initialized. Call initFirebase() first.');
    return _auth;
}

export function getFirebaseDb(): Firestore {
    if (!_db) throw new Error('[Firebase] Firestore not initialized. Call initFirebase() first.');
    return _db;
}

export function getFirebaseFunctions(): Functions {
    if (!_functions) throw new Error('[Firebase] Functions not initialized. Call initFirebase() first.');
    return _functions;
}

// Keep legacy exports pointing to lazy getters for backward compatibility.
// Components that import { auth } or { db } will get the live value
// once initFirebase() has been called at boot.
// NOTE: No Proxy exports. All consumers use getFirebaseAuth() and getFirebaseDb() directly.

// ── Main init function ───────────────────────────────────────────────

/**
 * Initialize Firebase app, Auth, and Firestore.
 * Must be called AFTER notifyAppReady() in App.tsx boot sequence.
 * Safe to call multiple times — idempotent.
 */
export async function initFirebase(): Promise<void> {
    if (_initialized) {
        console.log('[Firebase] Already initialized, skipping.');
        return;
    }

    console.log('[Firebase] Starting initialization...');

    const firebaseConfig = {
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    };

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error('[Firebase] Missing required VITE_FIREBASE_* environment variables. Copy .env.example to .env and fill in values.');
    }


    // 1. Init app
    if (getApps().length > 0) {
        _app = getApp();
        console.log('[Firebase] Using existing Firebase app instance');
    } else {
        _app = initializeApp(firebaseConfig);
        console.log('[Firebase] Created new Firebase app instance');
    }

    // 2. Init Auth with appropriate persistence
    if (Capacitor.isNativePlatform()) {
        try {
            _auth = initializeAuth(_app, {
                persistence: indexedDBLocalPersistence
            });
            console.log('[Firebase] Auth initialized with IndexedDB persistence (native)');
        } catch (err) {
            console.warn('[Firebase] initializeAuth failed on native, falling back to getAuth:', err);
            try {
                _auth = getAuth(_app);
                console.log('[Firebase] Fallback getAuth succeeded');
            } catch (fallbackErr) {
                console.error('[Firebase] CRITICAL: Fallback getAuth failed:', fallbackErr);
            }
        }
    } else {
        _auth = getAuth(_app);
        console.log('[Firebase] Auth initialized with default browser persistence');
    }

    // 3. Init Firestore
    _db = getFirestore(_app);
    
    // 4. Init Functions
    _functions = getFunctions(_app);
    console.log('[Firebase] App + Auth + Firestore + Functions created for project:', firebaseConfig.projectId);

    _initialized = true;
    console.log('[Firebase] Initialization complete.');
}

export default { getAuth: getFirebaseAuth, getFirestore: getFirebaseDb };
