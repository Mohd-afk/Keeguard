import { registerPlugin, Capacitor } from '@capacitor/core';

export interface CategorySyncPlugin {
  syncCategories(opts: {
    categories: Record<string, string>;
  }): Promise<void>;
}

const CategorySyncBridge = registerPlugin<CategorySyncPlugin>('CategorySyncBridge');

export async function syncCategoriesToNative(categories: Record<string, string>): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await CategorySyncBridge.syncCategories({ categories });
  } catch (err) {
    console.error('Failed to sync categories to native Android layer:', err);
  }
}
