import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface AutofillSaveEvent {
  action: 'new' | 'update';
  domain: string;
  username: string;
  password?: string;
  credentialId?: string;
  suggestedCategoryId?: string;
}

export interface AutofillBridgePlugin {
  saveCredentialFromAutofill(opts: {
    action: string;
    domain: string;
    username: string;
    password?: string;
    categoryId: string;
    credentialId?: string;
  }): Promise<void>;
  dismissSavePrompt(): Promise<void>;
  recordCategoryOverride(opts: {
    domain: string;
    categoryId: string;
  }): Promise<void>;
  addListener(
    event: 'autofillSaveRequest',
    handler: (data: AutofillSaveEvent) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const AutofillBridge = registerPlugin<AutofillBridgePlugin>('AutofillBridge');

export { AutofillBridge };
