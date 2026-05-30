// ─── Users API Client Wrapper ────────────────────────────────────────────────
// Rewritten to use client-side Firestore queries because Cloud Functions
// cannot be deployed on the free Spark plan.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, query, where, limit, getDocs, doc, getDoc, documentId } from 'firebase/firestore';
import { getFirebaseDb, getFirebaseAuth } from '../firebase';

export interface UserSearchResult {
  uid: string;
  username: string;
  displayName?: string;
}

export async function searchUsers(queryText: string): Promise<UserSearchResult[]> {
  const db = getFirebaseDb();
  const auth = getFirebaseAuth();
  const currentUserUid = auth.currentUser?.uid;
  
  // Clean query text: remove leading '@' and lowercase
  const cleanQuery = queryText.trim().toLowerCase().replace(/^@/, '');
  if (cleanQuery.length < 3) return [];

  // Prefix search in 'usernames' collection
  const usernamesRef = collection(db, 'usernames');
  const q = query(
    usernamesRef,
    where(documentId(), '>=', cleanQuery),
    where(documentId(), '<=', cleanQuery + '\uf8ff'),
    limit(5)
  );

  const snap = await getDocs(q);
  const results: UserSearchResult[] = [];

  for (const document of snap.docs) {
    const username = document.id;
    const data = document.data();
    if (!data || !data.uid) continue;

    const userUid = data.uid;
    if (userUid === currentUserUid) continue; // Don't return self

    // Fetch public profile for displayName
    const profileSnap = await getDoc(doc(db, 'userProfiles', userUid));
    let displayName: string | undefined;
    
    if (profileSnap.exists()) {
      const pData = profileSnap.data();
      displayName = pData.display_name || pData.displayName || undefined;
    }

    results.push({
      uid: userUid,
      username,
      displayName,
    });
  }

  return results;
}

export async function getConnections(): Promise<UserSearchResult[]> {
  // Graceful degradation: collectionGroup queries are restricted by rules,
  // and Cloud Functions are unavailable. Connections list is empty,
  // but users can still search using searchUsers().
  return [];
}
