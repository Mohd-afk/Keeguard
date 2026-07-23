import { firebaseConfig, getValidIdToken } from './firebase-init.js';
import { decryptVault } from './vault-crypto.js';

let decryptedVaultCache = null; // Ephemeral decrypted items array

export async function getSessionKey() {
  const data = await chrome.storage.session.get('encryptionKey');
  return data.encryptionKey || null;
}

export async function setSessionKey(keyHex) {
  await chrome.storage.session.set({ encryptionKey: keyHex });
}

export async function getLocalVault() {
  if (decryptedVaultCache) return decryptedVaultCache;
  
  const keyHex = await getSessionKey();
  if (!keyHex) return null;

  const data = await chrome.storage.local.get('encryptedVault');
  if (!data.encryptedVault) return [];

  try {
    const decryptedStr = await decryptVault(data.encryptedVault, keyHex);
    decryptedVaultCache = JSON.parse(decryptedStr);
    return decryptedVaultCache;
  } catch (e) {
    console.error('[Sync] Local decryption failed:', e);
    return null;
  }
}

export async function getLocalProfiles() {
  const data = await chrome.storage.local.get('fieldProfiles');
  return data.fieldProfiles || [];
}

export async function syncVault() {
  const uid = (await chrome.storage.local.get('uid')).uid;
  const idToken = await getValidIdToken();
  
  if (!uid || !idToken) {
    console.log('[Sync] No credentials or session token - skipping sync');
    return;
  }

  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/vault`;
    const response = await fetch(firestoreUrl, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    if (response.status === 404) {
      console.log('[Sync] Vault document not found in Firestore');
    } else {
      const doc = await response.json();
      if (doc.fields && doc.fields.encryptedPayload) {
        const encryptedPayloadStr = doc.fields.encryptedPayload.stringValue;
        const encryptedPayload = JSON.parse(encryptedPayloadStr);
        
        // Save raw encrypted payload locally
        await chrome.storage.local.set({ encryptedVault: encryptedPayload });
        
        // If vault is unlocked, decrypt and update cache
        const keyHex = await getSessionKey();
        if (keyHex) {
          const decryptedStr = await decryptVault(encryptedPayload, keyHex);
          decryptedVaultCache = JSON.parse(decryptedStr);
          console.log('[Sync] Vault synced and decrypted successfully. Count:', decryptedVaultCache.length);
        } else {
          console.log('[Sync] Vault synced but remains locked.');
        }
      }
    }

    // Sync field profiles
    try {
      const profilesUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/field_profiles`;
      const pResponse = await fetch(profilesUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (pResponse.ok) {
        const pDoc = await pResponse.json();
        if (pDoc.fields && pDoc.fields.profiles) {
          const profilesList = JSON.parse(pDoc.fields.profiles.stringValue);
          await chrome.storage.local.set({ fieldProfiles: profilesList });
          console.log('[Sync] Field profiles synced successfully. Count:', profilesList.length);
        }
      }
    } catch (pe) {
      console.warn('[Sync] Field profiles sync check failed:', pe);
    }
  } catch (e) {
    console.error('[Sync] Sync failed:', e);
  }
}

/** Add a new profile to local storage and push to Firestore */
export async function saveProfileToCloud(newProfile) {
  const existing = await getLocalProfiles();
  const now = new Date().toISOString();
  const profile = {
    ...newProfile,
    id: 'profile_ext_' + Date.now(),
    createdAt: now,
    updatedAt: now,
    fields: (newProfile.fields || []).map((f, i) => ({
      ...f,
      id: f.id || ('field_ext_' + Date.now() + '_' + i),
    })),
  };
  const updated = [...existing, profile];
  await chrome.storage.local.set({ fieldProfiles: updated });

  // Push to Firestore
  try {
    const uid = (await chrome.storage.local.get('uid')).uid;
    const idToken = await getValidIdToken();
    if (uid && idToken) {
      const profilesUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/field_profiles`;
      await fetch(profilesUrl, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            profiles: { stringValue: JSON.stringify(updated) },
            updatedAt: { stringValue: now },
          }
        })
      });
    }
  } catch (e) {
    console.warn('[Sync] Could not push new profile to Firestore:', e);
  }

  return profile;
}
