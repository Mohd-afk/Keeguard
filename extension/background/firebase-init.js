// PURPOSE: Browser extension background service worker handling firebase-init.
export const firebaseConfig = {
  apiKey: 'AIzaSyDsAH9mhH9IFYLyEjqKfy7uTnNRbU7Mg00',
  authDomain: 'vault-app-ba6e2.firebaseapp.com',
  projectId: 'vault-app-ba6e2',
  storageBucket: 'vault-app-ba6e2.firebasestorage.app',
  messagingSenderId: '1087322543080',
  appId: '1:1087322543080:web:a1fa522bdcb3e3518b8a5d'
};

/**
 * Refreshes the Firebase Auth ID Token using the refresh token if expired.
 */
export async function getValidIdToken() {
  const data = await chrome.storage.local.get(['idToken', 'refreshToken', 'uid']);
  if (!data.idToken || !data.refreshToken) return null;

  // Simple token validity check - we can check expiration by parsing JWT, 
  // or just refresh to be safe, or check network response.
  // Let's decode the JWT expiration.
  try {
    const payload = JSON.parse(atob(data.idToken.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp > now + 60) {
      // Still valid for at least 1 minute
      return data.idToken;
    }
  } catch (e) {
    // Parsing failed, refresh anyway
  }

  console.log('[Firebase] Refreshing ID Token...');
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${data.refreshToken}`
  });

  const refreshData = await response.json();
  if (refreshData.error) {
    console.error('[Firebase] Failed to refresh token:', refreshData.error);
    return null;
  }

  await chrome.storage.local.set({
    idToken: refreshData.id_token,
    refreshToken: refreshData.refresh_token
  });

  return refreshData.id_token;
}

export const db = {};
export const auth = {};
