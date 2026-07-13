/**
 * SmartCategorizer.ts
 * Premium Multi-Signal AI-assisted organization engine for KeeGuard.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface VaultItemData {
  id?: string;
  domain?: string;
  url?: string;
  website?: string;
  title?: string;
  appName?: string;
  name?: string;
  username?: string;
  notes?: string;
  note?: string; // standard note mapping
  metadata?: string;
  category?: string;
  categoryId?: string;
  type?: string;
  labels?: string[];
  tags?: string[];
  totpIssuer?: string;
  packageName?: string;
  source?: string;
  createdFrom?: string;
  [key: string]: any;
}

export interface CategorizeResult {
  category: string;
  predictedCategoryId?: string;
  predictedCategoryKey?: string;
  serviceName: string;
  confidence: number;
  confidenceScore?: number;
  source: string;
  action: string;
  evidence: string[];
  alternatives: { category: string; confidence: number; predictedCategoryId?: string }[];
  needsReview: boolean;
  duplicateClusterKey?: string;
  suggestedIconSource?: string;
}

export interface ItemProposal {
  itemId: string;
  title: string;
  domain: string;
  username: string;
  currentCategory: string;
  proposedCategory: string;
  confidence: number;
  source: string;
  action: string;
  changeType: 'none' | 'categorize' | 'move' | 'suggest-move';
  reason: string;
  recommended: boolean;
  approved: boolean;
  evidence: string[];
  alternatives: any[];
  needsReview: boolean;
  duplicateClusterKey?: string;
  suggestedIconSource?: string;
}

export interface NewCategoryProposal {
  categoryName: string;
  confidence: number;
  basedOnItems: string[];
  itemCount: number;
  reason: string;
  approved: boolean;
}

export interface OrganizationPlanSummary {
  totalReviewed: number;
  categorizeCount: number;
  moveCount: number;
  suggestMoveCount: number;
  unchangedCount: number;
  newCategoryCount: number;
  autoCheckedCount: number;
}

export interface OrganizationPlan {
  generatedAt: string;
  reviewRequired: boolean;
  summary: OrganizationPlanSummary;
  itemProposals: ItemProposal[];
  newCategoryProposals: NewCategoryProposal[];
  applyPlan: {
    createCategories: { name: string; confidence: number; approved: boolean; basedOnItems: string[] }[];
    itemChanges: { itemId: string; fromCategory: string; toCategory: string; changeType: string; confidence: number; approved: boolean; reason: string }[];
  };
}

export interface ExtractedSignals {
  title: string;
  domain: string;
  packageName: string;
  customFields: Record<string, string>;
  notes: string;
  totpIssuer: string;
  username: string;
  usernameDomain: string;
  passwordType: 'api_key' | 'regular';
  existingCategoryId?: string;
  tags: string[];
  source: string;
}

// ── 1. Learned Preference Store ──────────────────────────────────────

export class LearnedPreferenceStoreService {
  private key = 'securevault_learned_preferences';

  getPreferences(): Record<string, string> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const stored = localStorage.getItem(this.key);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  savePreference(pattern: string, category: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      const prefs = this.getPreferences();
      prefs[pattern.toLowerCase().trim()] = category;
      localStorage.setItem(this.key, JSON.stringify(prefs));
    } catch (e) {
      console.error('Failed to save learned preference:', e);
    }
  }

  match(text: string): { category: string; weight: number } | null {
    const prefs = this.getPreferences();
    const cleanText = text.toLowerCase().trim();
    if (!cleanText) return null;

    for (const [pattern, category] of Object.entries(prefs)) {
      if (cleanText.includes(pattern) || pattern.includes(cleanText)) {
        return { category, weight: 0.90 };
      }
    }
    return null;
  }
}

export const LearnedPreferenceStore = new LearnedPreferenceStoreService();

// ── 2. Signal Extractor ──────────────────────────────────────────────

export class SignalExtractorService {
  extract(item: VaultItemData): ExtractedSignals {
    const title = (item.title || item.name || item.appName || '').trim();
    const url = (item.url || item.website || item.domain || '').trim();
    const notes = (item.notes || item.note || '').trim();
    const username = (item.username || '').trim();
    const packageName = (item.packageName || '').trim();
    const tags = Array.isArray(item.tags) ? item.tags : (item.labels || []);
    const totpIssuer = (item.totpIssuer || '').trim();
    const existingCategoryId = item.categoryId || item.category || undefined;
    const source = (item.source || item.createdFrom || 'manual').trim();

    // Normalize domain
    let domain = '';
    if (url) {
      try {
        const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const parsed = new URL(withProto);
        domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        domain = url.toLowerCase().replace(/^www\./, '').trim();
      }
    }

    // Extract identifier from package name
    let packageDomain = '';
    if (packageName) {
      const parts = packageName.toLowerCase().split('.');
      if (parts.length >= 2) {
        const candidate = parts.find(p => p !== 'com' && p !== 'android' && p !== 'apps' && p !== 'mshop' && p !== 'katana');
        if (candidate) packageDomain = candidate;
      }
    }

    // Parse serialized custom fields from notes (template layout support)
    const customFields: Record<string, string> = {};
    if (notes && notes.startsWith('__template__:')) {
      const lines = notes.split('\n');
      lines.slice(1).forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.substring(0, colonIdx).trim().toLowerCase();
          const value = line.substring(colonIdx + 1).trim();
          customFields[key] = value;
        }
      });
    }

    let usernameDomain = '';
    if (username && username.includes('@')) {
      usernameDomain = username.split('@')[1].toLowerCase().trim();
    }

    // Determine credential pattern to check if it's an infra/API key
    let passwordType: 'api_key' | 'regular' = 'regular';
    const pwd = String(item.password || '');
    if (pwd.length > 24 && /^[A-Za-z0-9_\-]+$/.test(pwd)) {
      passwordType = 'api_key';
    }

    return {
      title,
      domain: domain || packageDomain,
      packageName,
      customFields,
      notes,
      totpIssuer,
      username,
      usernameDomain,
      passwordType,
      existingCategoryId,
      tags,
      source
    };
  }
}

export const SignalExtractor = new SignalExtractorService();

// ── 3. Category Inference Engine ─────────────────────────────────────

interface ScoreDetail {
  category: string;
  score: number;
  evidence: string[];
}

export class CategoryInferenceEngineService {
  private categoryRules = [
    {
      key: 'email',
      id: 'cat_email',
      name: 'Email & Communication',
      indicators: ['gmail', 'outlook', 'yahoo', 'proton', 'zoho', 'hotmail', 'icloud', 'mailbox', 'inbox', 'mail', 'imap', 'smtp'],
      extraFields: ['recovery email', 'mailbox password', 'app password']
    },
    {
      key: 'social_media',
      id: 'cat_social',
      name: 'Social Media',
      indicators: ['instagram', 'facebook', 'x', 'twitter', 'snapchat', 'reddit', 'discord', 'telegram', 'whatsapp', 'linkedin', 'tiktok', 'pinterest']
    },
    {
      key: 'banking',
      id: 'cat_banking',
      name: 'Banking & Finance',
      indicators: ['bank', 'credit', 'debit', 'card', 'finance', 'wealth', 'upi', 'wallet', 'payment', 'paypal', 'stripe', 'ifsc', 'netbanking', 'cash', 'mpin', 'cif', 'account number', 'cardholder']
    },
    {
      key: 'shopping',
      id: 'cat_subs',
      name: 'Shopping',
      indicators: ['amazon', 'flipkart', 'myntra', 'etsy', 'shopify', 'ecommerce', 'order', 'seller', 'marketplace', 'ebay']
    },
    {
      key: 'work',
      id: 'cat_work',
      name: 'Work & Productivity',
      indicators: ['github', 'gitlab', 'jira', 'atlassian', 'slack', 'figma', 'aws', 'azure', 'gcp', 'office', 'admin', 'dashboard', 'workspace', 'sso', 'vpn', 'teams', 'zoom', 'notion', 'trello', 'confluence']
    },
    {
      key: 'entertainment',
      id: 'cat_subs',
      name: 'Entertainment',
      indicators: ['netflix', 'spotify', 'youtube', 'prime video', 'hulu', 'disney', 'hbomax', 'appletv', 'twitch', 'soundcloud', 'crunchyroll']
    },
    {
      key: 'gaming',
      id: 'cat_gaming',
      name: 'Gaming',
      indicators: ['steam', 'epic', 'riot', 'ubisoft', 'ea', 'playstation', 'xbox', 'roblox', 'battle.net', 'gog', 'nintendo', 'game']
    },
    {
      key: 'developer_or_infra',
      id: 'cat_work',
      name: 'Cloud Infrastructure',
      indicators: ['api key', 'ssh', 'server', 'db', 'postgres', 'mongodb', 'docker', 'kubernetes', 'cloudflare', 'vps', 'hosting', 'redis', 'mysql', 'heroku', 'digitalocean']
    }
  ];

  private matchesIndicator(text: string, ind: string): boolean {
    const textLower = text.toLowerCase();
    const indLower = ind.toLowerCase();
    
    // For single-letter indicators like 'x', enforce word boundaries
    if (indLower.length <= 2) {
      const escaped = indLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(textLower);
    }
    
    return textLower.includes(indLower);
  }

  score(signals: ExtractedSignals, prefsStore: LearnedPreferenceStoreService): ScoreDetail[] {
    const scoresMap = new Map<string, { score: number; evidence: string[] }>();

    const getScoreObj = (categoryName: string) => {
      if (!scoresMap.has(categoryName)) {
        scoresMap.set(categoryName, { score: 0, evidence: [] });
      }
      return scoresMap.get(categoryName)!;
    };

    const titleLower = signals.title.toLowerCase();
    const domainLower = signals.domain.toLowerCase();
    const notesLower = signals.notes.toLowerCase();
    const totpIssuerLower = signals.totpIssuer.toLowerCase();
    
    const customFieldsLowerKeys = Object.keys(signals.customFields);
    const customFieldsLowerValues = Object.values(signals.customFields).map(v => v.toLowerCase());

    // 1. Learned Preference Overrides (weight 0.90)
    const matchText = `${signals.domain} ${signals.title}`.trim();
    const override = prefsStore.match(matchText);
    if (override) {
      const scoreObj = getScoreObj(override.category);
      scoreObj.score += override.weight;
      scoreObj.evidence.push(`Matched historical user override: '${override.category}'`);
    }

    // 2. High-priority Rules (Weights: exact domain/package 1.0, title keyword 0.85, custom field 0.80, TOTP 0.75, notes 0.70)
    for (const rule of this.categoryRules) {
      const scoreObj = getScoreObj(rule.name);

      // Exact domain or package name match
      if (domainLower && rule.indicators.some(ind => this.matchesIndicator(domainLower, ind))) {
        scoreObj.score += 1.0;
        scoreObj.evidence.push(`Domain exact match clue: '${signals.domain}'`);
      }

      // Title keyword match
      if (titleLower && rule.indicators.some(ind => this.matchesIndicator(titleLower, ind))) {
        scoreObj.score += 0.85;
        scoreObj.evidence.push(`Title keyword matched clue: '${signals.title}'`);
      }

      // Custom fields match (e.g. Card, Cardholder, Net Banking)
      const hasCustomFieldKey = customFieldsLowerKeys.some(k => rule.indicators.some(ind => this.matchesIndicator(k, ind))) || 
                                (rule.extraFields && customFieldsLowerKeys.some(k => rule.extraFields!.some(ef => this.matchesIndicator(k, ef))));
      const hasCustomFieldValue = customFieldsLowerValues.some(v => rule.indicators.some(ind => this.matchesIndicator(v, ind)));
      if (hasCustomFieldKey || hasCustomFieldValue) {
        scoreObj.score += 0.80;
        scoreObj.evidence.push(`Template custom fields matched for '${rule.name}'`);
      }

      // TOTP Issuer match
      if (totpIssuerLower && rule.indicators.some(ind => this.matchesIndicator(totpIssuerLower, ind))) {
        scoreObj.score += 0.75;
        scoreObj.evidence.push(`TOTP issuer match: '${signals.totpIssuer}'`);
      }

      // Notes keyword match
      if (notesLower && rule.indicators.some(ind => this.matchesIndicator(notesLower, ind))) {
        scoreObj.score += 0.70;
        scoreObj.evidence.push(`Notes matched keyword clue for '${rule.name}'`);
      }
    }

    // 3. Medium-priority Rules (Username domain hint 0.35, tags 0.65)
    // Username domain hint: don't classify as email unless it is actual email site
    if (signals.usernameDomain) {
      const ud = signals.usernameDomain;
      const isPublicEmailServer = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'proton.me', 'icloud.com'].includes(ud);
      
      for (const rule of this.categoryRules) {
        const scoreObj = getScoreObj(rule.name);
        
        if (rule.indicators.some(ind => this.matchesIndicator(ud, ind))) {
          if (rule.key === 'email') {
            const isEmailService = rule.indicators.some(ind => this.matchesIndicator(domainLower, ind)) || rule.indicators.some(ind => this.matchesIndicator(titleLower, ind));
            if (isEmailService) {
              scoreObj.score += 0.35;
              scoreObj.evidence.push(`Username domain hint matches email provider`);
            }
          } else {
            if (!isPublicEmailServer) {
              scoreObj.score += 0.35;
              scoreObj.evidence.push(`Company email domain hints work account`);
            }
          }
        }
      }
    }

    // Tags/Labels match
    if (signals.tags.length > 0) {
      signals.tags.forEach(tag => {
        const tagLower = tag.toLowerCase().trim();
        for (const rule of this.categoryRules) {
          const scoreObj = getScoreObj(rule.name);
          if (tagLower === rule.key || tagLower === rule.name.toLowerCase() || rule.indicators.some(ind => tagLower.includes(ind))) {
            scoreObj.score += 0.65;
            scoreObj.evidence.push(`Attached tag matched: '${tag}'`);
          }
        }
      });
    }

    // 4. API Key/Infra credential pattern detection
    if (signals.passwordType === 'api_key') {
      const devObj = getScoreObj('Cloud Infrastructure');
      devObj.score += 0.50;
      devObj.evidence.push(`Credential length/format suggests API key / server token`);
    }

    const results: ScoreDetail[] = [];
    scoresMap.forEach((val, category) => {
      if (val.score > 0) {
        results.push({
          category,
          score: Math.min(1.0, val.score),
          evidence: val.evidence
        });
      }
    });

    return results.sort((a, b) => b.score - a.score);
  }
}

export const CategoryInferenceEngine = new CategoryInferenceEngineService();

// ── 4. Review Queue ──────────────────────────────────────────────────

export class ReviewQueueService {
  private queueKey = 'securevault_review_queue';

  getItemsToReview(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = localStorage.getItem(this.queueKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  addToQueue(itemId: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      const queue = new Set(this.getItemsToReview());
      queue.add(itemId);
      localStorage.setItem(this.queueKey, JSON.stringify(Array.from(queue)));
    } catch (e) {
      console.error('Failed to add item to review queue:', e);
    }
  }

  removeFromQueue(itemId: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      const queue = this.getItemsToReview().filter(id => id !== itemId);
      localStorage.setItem(this.queueKey, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to remove item from review queue:', e);
    }
  }
}

export const ReviewQueue = new ReviewQueueService();

// ── 5. Smart Organizer Engine (Exposing SmartCategorizer) ────────────

class SmartCategorizerService {
  private worker: Worker | null = null;
  private categories: Set<string>;
  private allowNewCategories: boolean;
  
  // Custom thresholds mapping the weights requirements
  private autoApplyThreshold = 0.8;
  private suggestThreshold = 0.55;
  private moveThreshold = 0.8;
  private newCategoryThreshold = 0.86;

  private callbacks: Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }>;
  private msgId: number;

  private BRAND_Synonyms: Record<string, string> = {
    'google mail': 'Gmail',
    'googlemail': 'Gmail',
    'gmail': 'Gmail',
    'mail.google.com': 'Gmail',
    'gmail.com': 'Gmail',
    'workspace mail': 'Gmail',
    'amazon': 'Amazon',
    'amazon.com': 'Amazon',
    'amazon.co.uk': 'Amazon',
    'aws': 'Amazon Web Services',
    'github.com': 'GitHub',
    'github': 'GitHub',
    'gitlab.com': 'GitLab',
    'gitlab': 'GitLab',
    'steam': 'Steam',
    'steampowered.com': 'Steam',
    'netflix': 'Netflix',
    'netflix.com': 'Netflix',
    'spotify': 'Spotify',
    'spotify.com': 'Spotify',
    'facebook': 'Facebook',
    'facebook.com': 'Facebook'
  };

  private categoryKeyMap: Record<string, { id: string; key: string }> = {
    'Email & Communication': { id: 'cat_email', key: 'email' },
    'Social Media': { id: 'cat_social', key: 'social_media' },
    'Banking & Finance': { id: 'cat_banking', key: 'banking' },
    'Shopping': { id: 'cat_subs', key: 'shopping' },
    'Work & Productivity': { id: 'cat_work', key: 'work' },
    'Entertainment': { id: 'cat_subs', key: 'entertainment' },
    'Gaming': { id: 'cat_gaming', key: 'gaming' },
    'Cloud Infrastructure': { id: 'cat_work', key: 'developer_or_infra' }
  };

  constructor() {
    this.categories = new Set([
      'Banking & Finance',
      'Email & Communication',
      'Gaming',
      'Shopping',
      'Social Media',
      'Education',
      'Work & Productivity',
      'Cloud Infrastructure',
      'Entertainment',
      'Travel',
      'Healthcare',
      'Uncategorized'
    ]);

    this.allowNewCategories = true;
    this.callbacks = new Map();
    this.msgId = 0;

    this._initWorker();
  }

  private _initWorker() {
    if (typeof window !== 'undefined' && !this.worker) {
      try {
        this.worker = new Worker(new URL('./ml_worker.ts', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e: MessageEvent) => {
          const { id, result, status } = e.data;
          if (status === 'complete' && this.callbacks.has(id)) {
            this.callbacks.get(id)?.resolve(result);
            this.callbacks.delete(id);
          }
        };
      } catch (err) {
        console.error("Failed to initialize ML Worker:", err);
      }
    }
  }

  resolveServiceName(title: string, domain: string): string {
    const rawName = `${domain} ${title}`.toLowerCase().trim();
    for (const [key, value] of Object.entries(this.BRAND_Synonyms)) {
      if (rawName.includes(key)) {
        return value;
      }
    }
    const cleanTitle = (title || domain || 'Unknown Account').trim();
    const firstWord = cleanTitle.split(/[^\p{L}\p{N}]+/u)[0] || cleanTitle;
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }

  generateDuplicateClusterKey(title: string, username: string): string {
    const normTitle = title.toLowerCase().replace(/[^\w]/g, '').slice(0, 10);
    const normUser = username.toLowerCase().replace(/[^\w]/g, '');
    return normTitle && normUser ? `dup_${normTitle}_${normUser}` : `dup_cluster_${Math.random().toString(36).substring(7)}`;
  }

  // --- Core Compatibility API ---

  async categorizeEntry(entry: VaultItemData, options: { mode?: 'new-entry' | 'organize-existing' } = {}): Promise<CategorizeResult> {
    const signals = SignalExtractor.extract(entry);
    const scored = CategoryInferenceEngine.score(signals, LearnedPreferenceStore);

    // If ML is active, try to fetch secondary Zero-Shot classifications
    let mlScore: any = null;
    if (this.worker && `${signals.title} ${signals.domain} ${signals.notes}`.trim().length >= 4) {
      try {
        mlScore = await this._scoreLocalAI(`${signals.title} ${signals.domain} ${signals.notes}`);
      } catch (_) {}
    }

    // Merge heuristics/ovr and ML score
    if (mlScore && mlScore.category) {
      const found = scored.find(s => s.category === mlScore.category);
      if (found) {
        found.score = Math.min(1.0, found.score + (mlScore.score * 0.25));
        found.evidence.push("Local Zero-Shot AI matched category");
      } else {
        scored.push({
          category: mlScore.category,
          score: mlScore.score,
          evidence: ["Local Zero-Shot AI classified entry"]
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // Finalize category selection based on confidence score
    const winner = scored[0];
    const second = scored[1];
    
    // Safety Margin penalty for close alternatives
    let confidence = winner ? winner.score : 0;
    if (winner && second) {
      const margin = winner.score - second.score;
      if (margin < 0.08) confidence = Math.max(0, confidence - 0.08);
      if (margin < 0.04) confidence = Math.max(0, confidence - 0.06);
    }
    confidence = Math.round(confidence * 100) / 100;

    const resolvedService = this.resolveServiceName(signals.title, signals.domain);
    const categoryName = confidence >= this.suggestThreshold && winner ? winner.category : 'Uncategorized';

    const needsReview = confidence < this.suggestThreshold;
    if (needsReview && entry.id) {
      ReviewQueue.addToQueue(entry.id);
    } else if (entry.id) {
      ReviewQueue.removeFromQueue(entry.id);
    }

    const mapping = this.categoryKeyMap[categoryName] || { id: 'default_passwords', key: 'general' };

    // Format top 3 alternatives
    const alternatives = scored.slice(1, 4).map(s => {
      const mapAlt = this.categoryKeyMap[s.category] || { id: 'default_passwords', key: 'general' };
      return {
        category: s.category,
        confidence: Math.round(s.score * 100) / 100,
        predictedCategoryId: mapAlt.id
      };
    });

    const isBanking = categoryName === 'Banking & Finance';
    const isShopping = categoryName === 'Shopping';
    
    // Icon inference
    let suggestedIcon = 'KeyRound';
    if (categoryName === 'Email & Communication') suggestedIcon = 'Mail';
    else if (categoryName === 'Social Media') suggestedIcon = 'Users';
    else if (isBanking) {
      if (signals.notes.toLowerCase().includes('crypto') || signals.title.toLowerCase().includes('crypto')) suggestedIcon = 'Wallet';
      else if (signals.notes.toLowerCase().includes('card') || signals.title.toLowerCase().includes('card')) suggestedIcon = 'CreditCard';
      else suggestedIcon = 'Landmark';
    }
    else if (isShopping) suggestedIcon = 'ShoppingBag';
    else if (categoryName === 'Work & Productivity') suggestedIcon = 'Briefcase';
    else if (categoryName === 'Entertainment') suggestedIcon = 'Tv';
    else if (categoryName === 'Gaming') suggestedIcon = 'Gamepad2';
    else if (categoryName === 'Cloud Infrastructure') suggestedIcon = 'Server';

    let action = 'leave-uncategorized';
    if (confidence >= this.autoApplyThreshold) {
      action = 'auto-categorize';
    } else if (confidence >= this.suggestThreshold) {
      action = 'suggest';
    }

    return {
      category: categoryName,
      predictedCategoryId: mapping.id,
      predictedCategoryKey: mapping.key,
      serviceName: resolvedService,
      confidence,
      confidenceScore: confidence,
      source: winner ? winner.evidence.join(', ') : 'No signal found',
      action,
      evidence: winner ? winner.evidence : ['Vague metadata, no strong clues'],
      alternatives,
      needsReview,
      duplicateClusterKey: this.generateDuplicateClusterKey(signals.title, signals.username),
      suggestedIconSource: suggestedIcon
    };
  }

  async planVaultOrganization(vaultItems: VaultItemData[], options: { includeCategorized?: boolean; includeUncategorized?: boolean; createNewCategories?: boolean; categoriesArray?: {id: string, name: string}[]; onProgress?: (current: number, total: number, label: string) => void } = {}): Promise<OrganizationPlan> {
    const includeCategorized = options.includeCategorized ?? true;
    const includeUncategorized = options.includeUncategorized ?? true;
    const createNewCategories = options.createNewCategories ?? this.allowNewCategories;

    if (options.categoriesArray) {
      for (const cat of options.categoriesArray) {
        this.categories.add(cat.name);
      }
    }

    const proposals: ItemProposal[] = [];
    const clusterBuckets = new Map<string, any[]>();

    // Pre-filter items to process so we can report accurate totals
    const itemsToProcess = vaultItems.filter(item => {
      let currentCategoryName = 'Uncategorized';
      if (item.categoryId && options.categoriesArray) {
        const found = options.categoriesArray.find(c => c.id === item.categoryId);
        if (found) currentCategoryName = found.name;
      }
      const isUncategorized = currentCategoryName === 'Uncategorized';
      return !(!includeUncategorized && isUncategorized) && !(!includeCategorized && !isUncategorized);
    });

    const total = itemsToProcess.length;

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      let currentCategoryName = 'Uncategorized';
      if (item.categoryId && options.categoriesArray) {
        const found = options.categoriesArray.find(c => c.id === item.categoryId);
        if (found) currentCategoryName = found.name;
      }

      const label = item.title || item.appName || item.domain || item.username || 'Unknown item';
      if (options.onProgress) options.onProgress(i + 1, total, label);

      // Yield to UI thread between items so progress updates render
      await new Promise<void>(r => setTimeout(r, 0));

      const result = await this.categorizeEntry(item, { mode: 'organize-existing' });
      const proposal = this._buildItemProposal(item, result, currentCategoryName);
      proposals.push(proposal);

      const clusterKey = this._clusterKey(item);
      if (!clusterBuckets.has(clusterKey)) clusterBuckets.set(clusterKey, []);
      clusterBuckets.get(clusterKey)?.push({ item, result, proposal });
    }

    const newCategoryProposals = createNewCategories
      ? this._detectNewCategoryCandidates(clusterBuckets)
      : [];

    const moveSummary = this._summarizePlan(proposals, newCategoryProposals);

    return {
      generatedAt: new Date().toISOString(),
      reviewRequired: true,
      summary: moveSummary,
      itemProposals: proposals,
      newCategoryProposals,
      applyPlan: this._buildApplyPlan(proposals, newCategoryProposals)
    };
  }

  learnFromUserDecision({ domain, chosenCategory }: { domain: string; chosenCategory: string }) {
    if (!domain || !chosenCategory) return;
    
    // Track preference in secure localStorage-backed store
    LearnedPreferenceStore.savePreference(domain, chosenCategory);

    this.categories.add(chosenCategory);
  }

  // --- Internal Methods ───

  private _buildItemProposal(item: VaultItemData, result: CategorizeResult, currentCategoryName: string): ItemProposal {
    const proposedCategory = result.category;
    const sameCategory = currentCategoryName.toLowerCase() === proposedCategory.toLowerCase();

    let changeType: 'none' | 'categorize' | 'move' | 'suggest-move' = 'none';
    let reason = 'No change suggested';
    let recommended = false;

    if (currentCategoryName === 'Uncategorized' && proposedCategory !== 'Uncategorized') {
      changeType = 'categorize';
      reason = `Categorize as ${proposedCategory} (${result.confidence * 100}% confidence)`;
      recommended = result.confidence >= this.autoApplyThreshold;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized' && result.confidence >= this.moveThreshold) {
      changeType = 'move';
      reason = `Highly confident move to ${proposedCategory}`;
      recommended = true;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized') {
      changeType = 'suggest-move';
      reason = `Suggested shift to ${proposedCategory} (Review recommended)`;
      recommended = false;
    }

    return {
      itemId: item.id || '',
      title: item.title || item.appName || item.domain || item.username || 'Unknown item',
      domain: item.domain || item.url || '',
      username: item.username || '',
      currentCategory: currentCategoryName,
      proposedCategory,
      confidence: result.confidence,
      source: result.source,
      action: result.action,
      changeType,
      reason,
      recommended,
      approved: recommended,
      evidence: result.evidence,
      alternatives: result.alternatives || [],
      needsReview: result.needsReview,
      duplicateClusterKey: result.duplicateClusterKey,
      suggestedIconSource: result.suggestedIconSource
    };
  }

  private _detectNewCategoryCandidates(clusterBuckets: Map<string, any[]>): NewCategoryProposal[] {
    const proposals: NewCategoryProposal[] = [];

    for (const [clusterKey, bucket] of clusterBuckets.entries()) {
      if (bucket.length < 3) continue;

      const domainTokens = clusterKey.split(':')[1]?.split('|').filter(Boolean) || [];
      if (domainTokens.length === 0) continue;

      const inferredName = this._titleCase(domainTokens[0]);
      if (!inferredName || this.categories.has(inferredName)) continue;

      const avgConfidence = bucket.reduce((sum: number, x: any) => sum + (x.result.confidence || 0), 0) / bucket.length;
      if (avgConfidence < this.newCategoryThreshold) continue;

      proposals.push({
        categoryName: inferredName,
        confidence: Math.round(avgConfidence * 100) / 100,
        basedOnItems: bucket.map((x: any) => x.item.id),
        itemCount: bucket.length,
        reason: `Cluster with ${bucket.length} items indicates custom domain category '${inferredName}'`,
        approved: false
      });
    }

    return proposals;
  }

  private _summarizePlan(itemProposals: ItemProposal[], newCategoryProposals: NewCategoryProposal[]): OrganizationPlanSummary {
    return {
      totalReviewed: itemProposals.length,
      categorizeCount: itemProposals.filter(x => x.changeType === 'categorize').length,
      moveCount: itemProposals.filter(x => x.changeType === 'move').length,
      suggestMoveCount: itemProposals.filter(x => x.changeType === 'suggest-move').length,
      unchangedCount: itemProposals.filter(x => x.changeType === 'none').length,
      newCategoryCount: newCategoryProposals.length,
      autoCheckedCount: itemProposals.filter(x => x.approved).length
    };
  }

  private _buildApplyPlan(itemProposals: ItemProposal[], newCategoryProposals: NewCategoryProposal[]) {
    return {
      createCategories: newCategoryProposals.map(p => ({
        name: p.categoryName,
        confidence: p.confidence,
        approved: p.approved,
        basedOnItems: p.basedOnItems
      })),
      itemChanges: itemProposals
        .filter(x => x.changeType !== 'none')
        .map(x => ({
          itemId: x.itemId,
          fromCategory: x.currentCategory,
          toCategory: x.proposedCategory,
          changeType: x.changeType,
          confidence: x.confidence,
          approved: x.approved,
          reason: x.reason
        }))
    };
  }

  private _scoreLocalAI(text: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return resolve(null);
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve: (result) => {
          if (!result || !result.label) resolve(null);
          else {
             resolve({
                category: result.label,
                score: result.score || 0,
                source: 'local-ai'
             });
          }
      }, reject });
      this.worker.postMessage({ id, text });
      
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          resolve(null);
        }
      }, 800);
    });
  }

  private _clusterKey(item: VaultItemData) {
    const title = String(item.title || item.appName || '').toLowerCase();
    const domain = String(item.domain || item.url || '').toLowerCase();
    const cleanDomain = domain.replace(/^www\./, '').split('.')[0] || '';
    const cleanTitle = title.split(/[^\p{L}\p{N}]+/u)[0] || '';
    return `${cleanDomain}:${cleanTitle}`;
  }

  private _titleCase(input: string) {
    return String(input || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
      .join(' ');
  }
}

export const SmartCategorizer = new SmartCategorizerService();
