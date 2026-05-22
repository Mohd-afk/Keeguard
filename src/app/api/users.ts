// ─── Users API Client Wrapper ────────────────────────────────────────────────
// Frontend wrapper to invoke user search Cloud Function.
// ─────────────────────────────────────────────────────────────────────────────

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase';

export interface UserSearchResult {
  uid: string;
  username: string;
  displayName?: string;
}

export async function searchUsers(queryText: string): Promise<UserSearchResult[]> {
  const functionsInstance = getFirebaseFunctions();
  const searchCallable = httpsCallable<{ query: string }, { results: UserSearchResult[] }>(
    functionsInstance,
    'searchUsers'
  );

  const response = await searchCallable({ query: queryText });
  return response.data.results;
}
