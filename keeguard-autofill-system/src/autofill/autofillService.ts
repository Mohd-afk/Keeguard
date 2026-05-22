// src/autofill/autofillService.ts
// React Native JS side — listens for autofill save events and shows the bottom sheet

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { KeeGuardAutofill } = NativeModules;
const emitter = Platform.OS === 'android' ? new NativeEventEmitter(KeeGuardAutofill) : null;

export interface AutofillSaveEvent {
  action: 'new' | 'update';
  domain: string;
  username: string;
  password: string;
  credentialId?: string;
  suggestedCategoryId?: string;
}

/**
 * Subscribe to autofill save prompts from the native AutofillService.
 * Call this once in your app's root component (App.tsx).
 *
 * When fired, show the AutofillSaveBottomSheet component with the event data.
 */
export function subscribeToAutofillSaveRequests(
  onSaveRequest: (event: AutofillSaveEvent) => void
): () => void {
  if (!emitter) return () => {};

  const subscription = emitter.addListener('AutofillSaveRequest', onSaveRequest);
  return () => subscription.remove();
}

/**
 * Confirm save — called when user taps Save in the bottom sheet
 */
export async function confirmAutofillSave(params: {
  action: 'new' | 'update';
  domain: string;
  username: string;
  password: string;
  categoryId: string;
  credentialId?: string;
}): Promise<void> {
  if (Platform.OS !== 'android') return;
  await KeeGuardAutofill.saveCredentialFromAutofill(
    params.action,
    params.domain,
    params.username,
    params.password,
    params.categoryId,
    params.credentialId ?? null
  );
}

/**
 * Record that the user overrode the suggested category for a domain.
 * The native layer uses this to learn preferences.
 */
export function recordCategoryOverride(domain: string, categoryId: string): void {
  if (Platform.OS !== 'android') return;
  KeeGuardAutofill.recordCategoryOverride(domain, categoryId);
}

/**
 * Dismiss the save prompt without saving
 */
export async function dismissAutofillPrompt(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await KeeGuardAutofill.dismissSavePrompt();
}
