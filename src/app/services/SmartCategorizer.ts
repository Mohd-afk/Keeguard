/**
 * SmartCategorizer.ts
 * Production-grade smart categorizer core for password managers.
 */

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
  metadata?: string;
  category?: string;
  categoryId?: string;
  type?: string;
  [key: string]: any;
}

export interface CategorizeResult {
  category: string;
  confidence: number;
  source: string;
  action: string;
  evidence: string[];
  alternatives: { category: string; confidence: number }[];
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

class SmartCategorizerService {
  private worker: Worker | null = null;
  private categories: Set<string>;
  private allowNewCategories: boolean;
  private autoApplyThreshold: number;
  private suggestThreshold: number;
  private moveThreshold: number;
  private newCategoryThreshold: number;
  
  private userOverrides: Map<string, string>;
  private userCategoryAffinities: Map<string, number>;
  private trustedDb: Map<string, string>;
  private blacklistTokens: Set<string>;
  private keywordRules: any[];

  private callbacks: Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }>;
  private msgId: number;

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
    this.autoApplyThreshold = 0.9;
    this.suggestThreshold = 0.7;
    this.moveThreshold = 0.8;
    this.newCategoryThreshold = 0.86;

    this.userOverrides = new Map();
    this.userCategoryAffinities = new Map();
    
    this.trustedDb = new Map([
      ['gmail.com', 'Email & Communication'],
      ['mail.google.com', 'Email & Communication'],
      ['outlook.com', 'Email & Communication'],
      ['yahoo.com', 'Email & Communication'],
      ['steampowered.com', 'Gaming'],
      ['epicgames.com', 'Gaming'],
      ['playstation.com', 'Gaming'],
      ['xbox.com', 'Gaming'],
      ['hdfcbank.com', 'Banking & Finance'],
      ['onlinesbi.sbi', 'Banking & Finance'],
      ['icicibank.com', 'Banking & Finance'],
      ['chase.com', 'Banking & Finance'],
      ['amazon.com', 'Shopping'],
      ['flipkart.com', 'Shopping'],
      ['github.com', 'Work & Productivity'], // Mapped Development to Work for simpler hierarchy
      ['gitlab.com', 'Work & Productivity'],
      ['aws.amazon.com', 'Cloud Infrastructure'],
      ['console.aws.amazon.com', 'Cloud Infrastructure'],
      ['notion.so', 'Work & Productivity'],
      ['slack.com', 'Work & Productivity'],
      ['zoom.us', 'Work & Productivity'],
      ['netflix.com', 'Entertainment'],
      ['spotify.com', 'Entertainment']
    ]);

    this.blacklistTokens = new Set([
      'login', 'signin', 'account', 'secure', 'portal', 'online', 'web', 'app', 'home', 'com', 'org', 'net'
    ]);

    this.keywordRules = [
      { category: 'Banking & Finance', weight: 0.62, patterns: [/\bbank\b/i, /\bcredit\b/i, /\bloan\b/i, /\bfinance\b/i, /\bwealth\b/i, /\bupi\b/i, /\bcard\b/i, /\bpaypal\b/i, /\bstripe\b/i] },
      { category: 'Email & Communication', weight: 0.65, patterns: [/\bmail\b/i, /\binbox\b/i, /\bemail\b/i, /\bwebmail\b/i, /\bproton\b/i] },
      { category: 'Gaming', weight: 0.68, patterns: [/\bsteam\b/i, /\bgame\b/i, /\bgaming\b/i, /\bplaystation\b/i, /\bxbox\b/i, /\bnintendo\b/i, /\bepic\b/i] },
      { category: 'Shopping', weight: 0.64, patterns: [/\bshop\b/i, /\bstore\b/i, /\bbuy\b/i, /\bcart\b/i, /\border\b/i, /\bmarket\b/i] },
      { category: 'Social Media', weight: 0.66, patterns: [/\bsocial\b/i, /\bchat\b/i, /\bcommunity\b/i, /\bfriends\b/i, /\bmessage\b/i, /\bfacebook\b/i, /\binstagram\b/i, /\btwitter\b/i, /\btiktok\b/i] },
      { category: 'Education', weight: 0.69, patterns: [/\bschool\b/i, /\bcollege\b/i, /\buniversity\b/i, /\bstudent\b/i, /\bmoodle\b/i, /\bcourse\b/i] },
      { category: 'Work & Productivity', weight: 0.61, patterns: [/\bworkspace\b/i, /\bteam\b/i, /\bemployee\b/i, /\bcompany\b/i, /\binternal\b/i, /\boffice\b/i, /\bdeveloper\b/i, /\bapi\b/i, /\bgit\b/i, /\brepository\b/i, /\bdeploy\b/i] },
      { category: 'Cloud Infrastructure', weight: 0.72, patterns: [/\bcloud\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i, /\bkubernetes\b/i, /\bdevops\b/i, /\bserver\b/i, /\bdatabase\b/i] },
      { category: 'Entertainment', weight: 0.63, patterns: [/\bstream\b/i, /\bmovie\b/i, /\bvideo\b/i, /\bmusic\b/i, /\bott\b/i, /\bnetflix\b/i, /\bhulu\b/i, /\bdisney\b/i] },
      { category: 'Travel', weight: 0.64, patterns: [/\bflight\b/i, /\bhotel\b/i, /\btrip\b/i, /\btravel\b/i, /\bbooking\b/i] },
      { category: 'Healthcare', weight: 0.67, patterns: [/\bhospital\b/i, /\bhealth\b/i, /\bclinic\b/i, /\bmedical\b/i, /\bdoctor\b/i] },
    ];

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

  // --- Core API ---

  async categorizeEntry(entry: VaultItemData, options: { mode?: 'new-entry' | 'organize-existing' } = {}): Promise<CategorizeResult> {
    const normalized = this._normalizeEntry(entry);
    const signals: any[] = [];

    const overrideSignal = this._scoreUserOverride(normalized);
    if (overrideSignal) signals.push(overrideSignal);

    const trustedSignal = this._scoreTrustedDatabase(normalized);
    if (trustedSignal) signals.push(trustedSignal);

    signals.push(...this._scoreHeuristics(normalized));
    signals.push(...this._scoreUserHistory(normalized));

    const mergedSignals = this._mergeSignals(signals);

    let mlSignal = null;
    if (this.worker && normalized.contextText.length >= 4) {
      try {
        mlSignal = await this._scoreLocalAI(normalized);
        if (mlSignal) mergedSignals.push(mlSignal);
      } catch (_) {}
    }

    const ranked = this._rankCandidates(mergedSignals);
    return this._finalizeDecision(normalized, ranked, options.mode || 'new-entry');
  }

  async planVaultOrganization(vaultItems: VaultItemData[], options: { includeCategorized?: boolean; includeUncategorized?: boolean; createNewCategories?: boolean; categoriesArray?: {id: string, name: string}[] } = {}): Promise<OrganizationPlan> {
    const includeCategorized = options.includeCategorized ?? true;
    const includeUncategorized = options.includeUncategorized ?? true;
    const createNewCategories = options.createNewCategories ?? this.allowNewCategories;

    // Sync knowledge of current custom categories
    if (options.categoriesArray) {
        for (const cat of options.categoriesArray) {
            this.categories.add(cat.name);
        }
    }

    const proposals: ItemProposal[] = [];
    const clusterBuckets = new Map<string, any[]>();

    for (const item of vaultItems) {
      // Find the name of the current category
      let currentCategoryName = 'Uncategorized';
      if (item.categoryId && options.categoriesArray) {
         const found = options.categoriesArray.find(c => c.id === item.categoryId);
         if (found) currentCategoryName = found.name;
      }

      const isUncategorized = currentCategoryName === 'Uncategorized';
      if ((!includeUncategorized && isUncategorized) || (!includeCategorized && !isUncategorized)) continue;

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
    const normalizedDomain = this._normalizeHostname(domain);
    if (!normalizedDomain || !chosenCategory) return;

    this.userOverrides.set(normalizedDomain, chosenCategory);

    const existing = this.userCategoryAffinities.get(chosenCategory) || 0;
    this.userCategoryAffinities.set(chosenCategory, existing + 1);
    this.categories.add(chosenCategory);
  }

  // --- Internal Methods ---

  private _buildItemProposal(item: VaultItemData, result: CategorizeResult, currentCategoryName: string): ItemProposal {
    const proposedCategory = result.category;
    const sameCategory = currentCategoryName === proposedCategory || currentCategoryName.toLowerCase() === proposedCategory.toLowerCase();

    let changeType: 'none' | 'categorize' | 'move' | 'suggest-move' = 'none';
    let reason = 'No change suggested';
    let recommended = false;

    if (currentCategoryName === 'Uncategorized' && proposedCategory !== 'Uncategorized') {
      changeType = 'categorize';
      reason = `Categorize uncategorized item as ${proposedCategory}`;
      recommended = result.confidence >= this.suggestThreshold;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized' && result.confidence >= this.moveThreshold) {
      changeType = 'move';
      reason = `Move from ${currentCategoryName} to ${proposedCategory}`;
      recommended = true;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized') {
      changeType = 'suggest-move';
      reason = `Possible better fit in ${proposedCategory}`;
      recommended = false;
    }

    return {
      itemId: item.id || '',
      title: item.title || item.appName || item.domain || item.username || 'Unknown item',
      domain: this._normalizeHostname(item.domain || item.url || ''),
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
      alternatives: result.alternatives || []
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
      const distinctCurrentCategories = new Set(bucket.map((x: any) => x.proposal.currentCategory));
      const uncategorizedCount = bucket.filter((x: any) => x.proposal.currentCategory === 'Uncategorized').length;

      if (avgConfidence < this.newCategoryThreshold) continue;
      // Allow new category if it unifies multiple categories or categorizes many uncategorized items
      if (distinctCurrentCategories.size > 3 && uncategorizedCount < 2) continue;

      proposals.push({
        categoryName: inferredName,
        confidence: this._round(avgConfidence),
        basedOnItems: bucket.map((x: any) => x.item.id),
        itemCount: bucket.length,
        reason: `Create new category '${inferredName}' for similar items that cluster together`,
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

  private _scoreUserOverride(entry: any) {
    const direct = this.userOverrides.get(entry.hostname);
    if (!direct) return null;
    return {
      category: direct,
      score: 1.0,
      source: 'user-override',
      evidence: [`User previously selected ${direct} for ${entry.hostname}`]
    };
  }

  private _scoreTrustedDatabase(entry: any) {
    const exact = this.trustedDb.get(entry.hostname);
    if (exact) {
      return {
        category: exact,
        score: 0.98,
        source: 'trusted-db',
        evidence: [`Trusted mapping matched hostname ${entry.hostname}`]
      };
    }

    const root = this._rootDomain(entry.hostname);
    const rootMatch = this.trustedDb.get(root);
    if (rootMatch) {
      return {
        category: rootMatch,
        score: 0.95,
        source: 'trusted-db-root',
        evidence: [`Trusted mapping matched root domain ${root}`]
      };
    }

    return null;
  }

  private _scoreHeuristics(entry: any) {
    const signals = [];
    const text = entry.contextText;
    const tokenSet = new Set(entry.tokens);

    for (const rule of this.keywordRules) {
      let matches = 0;
      const evidence = [];
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          matches += 1;
          evidence.push(`Matched ${pattern} in metadata`);
        }
      }

      let score = rule.weight;
      if (matches > 1) score += Math.min(0.14, matches * 0.04);
      if (rule.category === 'Education' && entry.hostname.endsWith('.edu')) {
        score += 0.18;
        evidence.push('Hostname uses .edu TLD');
      }
      if (rule.category === 'Banking & Finance' && /bank|pay|finance|card/i.test(entry.hostname)) {
        score += 0.12;
        evidence.push('Financial token found in hostname');
      }
      if (rule.category === 'Email & Communication' && /mail/i.test(entry.hostname)) {
        score += 0.12;
        evidence.push('Mail token found in hostname');
      }
      if (rule.category === 'Gaming' && /steam|xbox|playstation|epic/i.test(entry.hostname)) {
        score += 0.14;
        evidence.push('Gaming token found in hostname');
      }

      if (/riverbank/i.test(entry.hostname) && rule.category === 'Banking & Finance') {
        score -= 0.28;
        evidence.push('False-positive suppression applied for riverbank-like hostname');
      }

      if (matches > 0) {
        signals.push({
          category: rule.category,
          score: this._clamp(score, 0, 0.96),
          source: 'heuristics',
          evidence
        });
      }
    }

    if (tokenSet.has('support') && tokenSet.has('ticket')) {
      signals.push({
        category: 'Work & Productivity',
        score: 0.74,
        source: 'heuristics',
        evidence: ['Support and ticket tokens indicate internal or work system']
      });
    }

    return signals;
  }

  private _scoreUserHistory(entry: any) {
    const signals = [];
    for (const [category, count] of this.userCategoryAffinities.entries()) {
      if (count < 3) continue;
      signals.push({
        category,
        score: this._clamp(0.45 + Math.min(0.2, count * 0.02), 0, 0.7),
        source: 'user-history',
        evidence: [`User often assigns items to ${category}`]
      });
    }
    return signals;
  }

  private _scoreLocalAI(entry: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return resolve(null);
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve: (result) => {
          if (!result || !result.label) resolve(null);
          else {
             resolve({
                category: result.label,
                score: this._clamp(result.score || 0, 0, 0.94),
                source: 'local-ai',
                evidence: ['Local AI fallback classified entry from contextual metadata']
             });
          }
      }, reject });
      this.worker.postMessage({ id, text: entry.contextText });
      
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          resolve(null); // Don't throw, just ignore ML result on timeout
        }
      }, 5000);
    });
  }

  private _mergeSignals(signals: any[]) {
    const merged = new Map();
    for (const signal of signals) {
      if (!signal || !signal.category) continue;
      const existing = merged.get(signal.category);
      if (!existing) {
        merged.set(signal.category, {
          category: signal.category,
          score: signal.score,
          sources: [signal.source],
          evidence: [...(signal.evidence || [])]
        });
      } else {
        existing.score = this._clamp(existing.score + (signal.score * 0.35), 0, 0.99);
        existing.sources.push(signal.source);
        existing.evidence.push(...(signal.evidence || []));
        merged.set(signal.category, existing);
      }
    }
    return Array.from(merged.values());
  }

  private _rankCandidates(candidates: any[]) {
    return candidates
      .map(x => ({
        ...x,
        score: this._round(x.score),
        sources: Array.from(new Set(x.sources || [])),
        evidence: Array.from(new Set(x.evidence || [])).slice(0, 5)
      }))
      .sort((a, b) => b.score - a.score);
  }

  private _finalizeDecision(entry: any, ranked: any[], mode: string): CategorizeResult {
    if (ranked.length === 0) {
      return {
        category: 'Uncategorized',
        confidence: 0,
        source: 'none',
        action: 'leave-uncategorized',
        evidence: ['No confident signal found'],
        alternatives: []
      };
    }

    const winner = ranked[0];
    const second = ranked[1];
    const margin = second ? winner.score - second.score : winner.score;

    let confidence = winner.score;
    if (margin < 0.08) confidence = this._clamp(confidence - 0.08, 0, 1);
    if (margin < 0.04) confidence = this._clamp(confidence - 0.06, 0, 1);

    let action = 'leave-uncategorized';
    if (mode === 'new-entry') {
      if (confidence >= this.autoApplyThreshold) action = 'auto-categorize';
      else if (confidence >= this.suggestThreshold) action = 'suggest';
    } else {
      if (confidence >= this.moveThreshold) action = 'propose-change';
      else if (confidence >= this.suggestThreshold) action = 'review-suggestion';
    }

    return {
      category: winner.category,
      confidence: this._round(confidence),
      source: winner.sources.join(', '),
      action,
      evidence: winner.evidence,
      alternatives: ranked.slice(1, 4).map(x => ({ category: x.category, confidence: x.score }))
    };
  }

  private _normalizeEntry(entry: VaultItemData) {
    const hostname = this._normalizeHostname(entry.domain || entry.url || entry.website || '');
    const appName = this._normalizeText(entry.appName || entry.name || entry.title || '');
    const title = this._normalizeText(entry.title || '');
    const username = this._normalizeText(entry.username || '');
    const notes = this._normalizeText(entry.notes || '');
    const metadata = this._normalizeText(entry.metadata || '');

    const contextText = [hostname, appName, title, username, notes, metadata]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const tokens = this._tokenize(contextText);

    return {
      raw: entry,
      hostname,
      appName,
      title,
      username,
      notes,
      metadata,
      contextText,
      tokens
    };
  }

  private _normalizeHostname(input: string) {
    if (!input) return '';
    try {
      const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return String(input).trim().toLowerCase().replace(/^www\./, '');
    }
  }

  private _normalizeText(value: any) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private _tokenize(text: string) {
    return text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(x => x.trim())
      .filter(x => x && !this.blacklistTokens.has(x));
  }

  private _rootDomain(hostname: string) {
    const parts = (hostname || '').split('.').filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  private _clusterKey(item: VaultItemData) {
    const hostname = this._normalizeHostname(item.domain || item.url || '');
    const root = this._rootDomain(hostname);
    const title = this._normalizeText(item.title || item.appName || '');
    const tokens = this._tokenize(`${root} ${title}`).slice(0, 3).sort();
    return `${root}:${tokens.join('|')}`;
  }

  private _titleCase(input: string) {
    return String(input || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
      .join(' ');
  }

  private _clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private _round(value: number) {
    return Math.round(value * 100) / 100;
  }
}

export const SmartCategorizer = new SmartCategorizerService();
