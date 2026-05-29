import { describe, it, expect, beforeEach } from 'vitest';

// Force overwrite globalThis.localStorage to ensure a perfectly working mock
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  },
  length: 0,
  key: (index: number) => null
} as any;

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

import {
  SmartCategorizer,
  SignalExtractor,
  CategoryInferenceEngine,
  LearnedPreferenceStore,
  ReviewQueue
} from '../app/services/SmartCategorizer';

describe('Smart Organizer Intelligence Layer Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should extract correct signals from vault items', () => {
    const item = {
      title: 'HDFC NetBanking',
      url: 'https://netbanking.hdfcbank.com/netbanking',
      username: 'mohd_afk@gmail.com',
      notes: '__template__:banking\nBank Name: HDFC\nAccount Number: 1234567890',
      packageName: 'com.hdfcbank.netbanking'
    };

    const signals = SignalExtractor.extract(item);
    expect(signals.title).toBe('HDFC NetBanking');
    expect(signals.domain).toBe('netbanking.hdfcbank.com');
    expect(signals.customFields['bank name']).toBe('HDFC');
    expect(signals.customFields['account number']).toBe('1234567890');
    expect(signals.usernameDomain).toBe('gmail.com');
  });

  it('should correctly classify item with no URL but clear title', async () => {
    const item = {
      title: 'Steam Client Login',
      username: 'gamer_boy_99',
      password: 'password123'
    };

    const result = await SmartCategorizer.categorizeEntry(item);
    expect(result.category).toBe('Gaming');
    expect(result.predictedCategoryId).toBe('cat_gaming');
    expect(result.needsReview).toBe(false);
  });

  it('should correctly classify item with no URL and vague title but strong template fields', async () => {
    const item = {
      title: 'Personal Account',
      username: 'my_username',
      notes: '__template__:banking\nCardholder Name: Mohd afk\nCard Number: 4111222233334444\nExpiry Date: 12/29'
    };

    const result = await SmartCategorizer.categorizeEntry(item);
    console.log('DEBUG [Banking Case] Result:', JSON.stringify(result, null, 2));
    
    expect(result.category).toBe('Banking & Finance');
    expect(result.predictedCategoryId).toBe('cat_banking');
    expect(result.needsReview).toBe(false);
  });

  it('should ignore username email domain bias for misleading usernames', async () => {
    const item = {
      title: 'Netflix Stream',
      url: 'netflix.com',
      username: 'work_admin@corporate-email.com',
      notes: 'Subscribed to premium family plan'
    };

    const result = await SmartCategorizer.categorizeEntry(item);
    console.log('DEBUG [Netflix Case] Result:', JSON.stringify(result, null, 2));

    expect(result.category).toBe('Entertainment');
    expect(result.predictedCategoryId).toBe('cat_subs');
    expect(result.needsReview).toBe(false);
  });

  it('should not force corporate email on neutral service into Work', async () => {
    const item = {
      title: 'Spotify Account',
      url: 'spotify.com',
      username: 'developer@my-company.com',
      notes: 'Daily music'
    };

    const result = await SmartCategorizer.categorizeEntry(item);
    expect(result.category).toBe('Entertainment');
    expect(result.predictedCategoryId).toBe('cat_subs');
    expect(result.needsReview).toBe(false);
  });

  it('should route low-confidence items with vague metadata to the review queue', async () => {
    const item = {
      id: 'vague_entry_123',
      title: 'My Custom Account Details',
      username: 'some_user_id',
      notes: 'vague notes here'
    };

    const result = await SmartCategorizer.categorizeEntry(item);
    expect(result.category).toBe('Uncategorized');
    expect(result.needsReview).toBe(true);

    const reviewItems = ReviewQueue.getItemsToReview();
    expect(reviewItems).toContain('vague_entry_123');
  });

  it('should learn from repeated user decisions and prioritize learned preferences', async () => {
    const item = {
      title: 'My Custom Site',
      url: 'internal-portal.local',
      username: 'admin'
    };

    // First try should be uncategorized (vague)
    const result1 = await SmartCategorizer.categorizeEntry(item);
    expect(result1.category).toBe('Uncategorized');
    expect(result1.needsReview).toBe(true);

    // Retrain the model on user decision
    SmartCategorizer.learnFromUserDecision({
      domain: 'internal-portal.local',
      chosenCategory: 'Work & Productivity'
    });

    // Second try should be successfully classified as Work & Productivity
    const result2 = await SmartCategorizer.categorizeEntry(item);
    expect(result2.category).toBe('Work & Productivity');
    expect(result2.predictedCategoryId).toBe('cat_work');
    expect(result2.needsReview).toBe(false);
    expect(result2.evidence.some(e => e.includes('override'))).toBe(true);
  });
});
