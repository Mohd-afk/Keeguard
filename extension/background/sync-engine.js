// PURPOSE: Browser extension background service worker handling sync-engine.
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

    // Sync field profiles with local-first timestamp merge
    try {
      const profilesUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/field_profiles`;
      const pResponse = await fetch(profilesUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      const localProfiles = await getLocalProfiles();

      if (pResponse.ok) {
        const pDoc = await pResponse.json();
        if (pDoc.fields && pDoc.fields.profiles) {
          const remoteProfiles = JSON.parse(pDoc.fields.profiles.stringValue);

          // Merge local and remote profiles by ID, preserving whichever is newer
          const profileMap = new Map();
          remoteProfiles.forEach(p => profileMap.set(p.id, p));

          localProfiles.forEach(lp => {
            const rp = profileMap.get(lp.id);
            if (!rp) {
              profileMap.set(lp.id, lp); // Local only profile -> keep
            } else {
              const lTime = new Date(lp.updatedAt || lp.createdAt || 0).getTime();
              const rTime = new Date(rp.updatedAt || rp.createdAt || 0).getTime();
              if (lTime >= rTime) {
                profileMap.set(lp.id, lp); // Local is newer or equal -> keep
              }
            }
          });

          const mergedProfiles = Array.from(profileMap.values());
          await chrome.storage.local.set({ fieldProfiles: mergedProfiles });

          // If local had changes not in remote, push merged back to Firestore
          if (JSON.stringify(mergedProfiles) !== JSON.stringify(remoteProfiles)) {
            const patchUrl = `${profilesUrl}?updateMask.fieldPaths=profiles&updateMask.fieldPaths=updatedAt`;
            fetch(patchUrl, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: {
                  profiles: { stringValue: JSON.stringify(mergedProfiles) },
                  updatedAt: { stringValue: new Date().toISOString() },
                }
              })
            }).catch(e => console.warn('[Sync] Push merged profiles failed:', e));
          }
          console.log('[Sync] Field profiles synced successfully. Count:', mergedProfiles.length);
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

  // Push to Firestore with updateMask.fieldPaths
  try {
    const uid = (await chrome.storage.local.get('uid')).uid;
    const idToken = await getValidIdToken();
    if (uid && idToken) {
      const profilesUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/field_profiles?updateMask.fieldPaths=profiles&updateMask.fieldPaths=updatedAt`;
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

/** Delete a profile from local storage and update Firestore */
export async function deleteProfileFromCloud(profileId) {
  const existing = await getLocalProfiles();
  const updated = existing.filter(p => p.id !== profileId);
  const now = new Date().toISOString();
  await chrome.storage.local.set({ fieldProfiles: updated });

  try {
    const uid = (await chrome.storage.local.get('uid')).uid;
    const idToken = await getValidIdToken();
    if (uid && idToken) {
      const profilesUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}/data/field_profiles?updateMask.fieldPaths=profiles&updateMask.fieldPaths=updatedAt`;
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
    console.warn('[Sync] Could not sync profile delete to Firestore:', e);
  }
}
