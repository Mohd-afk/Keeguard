import { db, auth } from './firebase-init.js';
import { decryptVault, encryptVault, deriveKeys } from './vault-crypto.js';
import { syncVault, getLocalVault, getSessionKey, setSessionKey } from './sync-engine.js';

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'LOGIN':
      handleLogin(message.email, message.password)
        .then(res => sendResponse({ success: true, user: res }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response

    case 'LOGOUT':
      handleLogout()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_CREDENTIALS':
      handleGetCredentials(message.domain)
        .then(creds => sendResponse({ success: true, credentials: creds }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SAVE_CREDENTIAL':
      handleSaveCredential(message.credential)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'IS_UNLOCKED':
      getSessionKey()
        .then(key => sendResponse({ unlocked: !!key }))
        .catch(() => sendResponse({ unlocked: false }));
      return true;

    case 'PREPARE_SAVE':
      handlePrepareSave(sender.tab?.id, message.credential)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CHECK_PREPARED_SAVE':
      handleCheckPreparedSave(sender.tab?.id)
        .then(cred => sendResponse({ success: true, credential: cred }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

// Alarm to periodically sync the vault
chrome.alarms.create('periodic-sync', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodic-sync') {
    console.log('[Background] Periodic sync alarm fired');
    syncVault().catch(err => console.error('[Background] Sync failed:', err));
  }
});

// Perform sync on load if logged in
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
});

async function handleLogin(email, password) {
  // 1. Derive keys
  const keys = await deriveKeys(password, email);
  
  // 2. Auth to Firebase using Derived Auth Key as password
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email,
      password: keys.authKey,
      returnSecureToken: true
    })
  });
  
  const authData = await response.json();
  if (authData.error) {
    throw new Error(authData.error.message);
  }
  
  // 3. Store tokens and key in session/local storage
  await chrome.storage.local.set({
    uid: authData.localId,
    idToken: authData.idToken,
    refreshToken: authData.refreshToken,
    email: email
  });
  
  await setSessionKey(keys.encryptionKeyHex);
  
  // 4. Initial sync
  await syncVault();
  
  return { email: email, uid: authData.localId };
}

async function handleLogout() {
  await chrome.storage.local.remove(['uid', 'idToken', 'refreshToken', 'email', 'encryptedVault']);
  await chrome.storage.session.remove(['encryptionKey']);
}

async function handleGetCredentials(domain) {
  const encKeyHex = await getSessionKey();
  if (!encKeyHex) throw new Error('Vault is locked');
  
  const localVault = await getLocalVault();
  if (!localVault || !localVault.length) return [];
  
  if (!domain) {
    return localVault.filter(item => !item.deletedAt);
  }

  // Clean domain (e.g. www.sub.example.com -> example.com)
  const cleanDomain = normalizeDomain(domain);
  
  return localVault.filter(item => {
    if (item.deletedAt) return false;
    if (item.url) {
      const cleanUrl = normalizeDomain(item.url);
      return cleanUrl === cleanDomain || cleanDomain.endsWith('.' + cleanUrl) || cleanUrl.endsWith('.' + cleanDomain);
    }
    return false;
  });
}

async function handleSaveCredential(credential) {
  const encKeyHex = await getSessionKey();
  if (!encKeyHex) throw new Error('Vault is locked');
  
  const localVault = await getLocalVault();
  if (!localVault) throw new Error('Failed to load and decrypt local vault. Please lock and unlock the extension.');
  
  // Check if item already exists to update it, else append
  const existingIndex = localVault.findIndex(item => 
    item.username === credential.username && 
    normalizeDomain(item.url) === normalizeDomain(credential.url)
  );
  
  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    localVault[existingIndex] = {
      ...localVault[existingIndex],
      password: credential.password,
      updatedAt: now
    };
  } else {
    localVault.push({
      id: crypto.randomUUID(),
      title: credential.title || new URL(credential.url).hostname,
      username: credential.username,
      password: credential.password,
      type: 'Website',
      url: credential.url,
      note: '',
      createdAt: now,
      updatedAt: now
    });
  }
  
  // Re-encrypt and save locally and to Firestore
  const encryptedPayload = await encryptVault(JSON.stringify(localVault), encKeyHex);
  
  const uid = (await chrome.storage.local.get('uid')).uid;
  const idToken = (await chrome.storage.local.get('idToken')).idToken;
  
  if (uid && idToken) {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/vault?updateMask.fieldPaths=encryptedPayload&updateMask.fieldPaths=updatedAt`;
    
    const res = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          encryptedPayload: { stringValue: JSON.stringify(encryptedPayload) },
          updatedAt: { stringValue: now }
        }
      })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Background] Firestore save failed:', res.status, errText);
      throw new Error(`Cloud sync failed: ${res.status} ${res.statusText}`);
    }
    
    // Save to local cache
    await chrome.storage.local.set({ encryptedVault: encryptedPayload });
  }
}

async function handlePrepareSave(tabId, credential) {
  if (!tabId) return;
  const res = await chrome.storage.session.get('preparedSaves');
  const preparedSaves = res.preparedSaves || {};
  preparedSaves[tabId] = {
    ...credential,
    timestamp: Date.now()
  };
  await chrome.storage.session.set({ preparedSaves });
}

async function handleCheckPreparedSave(tabId) {
  if (!tabId) return null;
  const res = await chrome.storage.session.get('preparedSaves');
  const preparedSaves = res.preparedSaves || {};
  const cred = preparedSaves[tabId];
  if (cred) {
    delete preparedSaves[tabId];
    await chrome.storage.session.set({ preparedSaves });
    if (Date.now() - cred.timestamp < 60000) {
      return cred;
    }
  }
  return null;
}

function normalizeDomain(urlStr) {
  try {
    let host = urlStr;
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      host = new URL(urlStr).hostname;
    }
    host = host.toLowerCase().replace(/^www\./, '');
    return host;
  } catch (e) {
    return urlStr.toLowerCase();
  }
}

// Config injected globally
const firebaseConfig = {
  apiKey: 'AIzaSyDsAH9mhH9IFYLyEjqKfy7uTnNRbU7Mg00',
  authDomain: 'vault-app-ba6e2.firebaseapp.com',
  projectId: 'vault-app-ba6e2',
  storageBucket: 'vault-app-ba6e2.firebasestorage.app',
  messagingSenderId: '1087322543080',
  appId: '1:1087322543080:web:a1fa522bdcb3e3518b8a5d'
};
