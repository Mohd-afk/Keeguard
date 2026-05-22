/**
 * smart_categorizer.js
 * Production-grade smart categorizer core for password managers.
 *
 * Features:
 * - Categorize new password entries.
 * - Analyze existing vault items.
 * - Propose recategorization, moves, and new category creation.
 * - Preview-only planning first, explicit apply later.
 * - User override learning.
 * - Safe confidence-based review workflow.
 */

export class SmartCategorizer {
  constructor(options = {}) {
    this.worker = options.worker || null;
    this.categories = new Set(options.categories || [
      'Banking',
      'Email',
      'Gaming',
      'Shopping',
      'Social Media',
      'Education',
      'Work',
      'Development',
      'Cloud Infra',
      'Entertainment',
      'Travel',
      'Healthcare',
      'Uncategorized'
    ]);

    this.allowNewCategories = options.allowNewCategories ?? true;
    this.autoApplyThreshold = options.autoApplyThreshold ?? 0.9;
    this.suggestThreshold = options.suggestThreshold ?? 0.7;
    this.moveThreshold = options.moveThreshold ?? 0.8;
    this.newCategoryThreshold = options.newCategoryThreshold ?? 0.86;

    this.userOverrides = new Map(Object.entries(options.userOverrides || {}));
    this.userCategoryAffinities = new Map();
    this.trustedDb = new Map(Object.entries(options.trustedDb || {
      'gmail.com': 'Email',
      'mail.google.com': 'Email',
      'outlook.com': 'Email',
      'yahoo.com': 'Email',
      'steampowered.com': 'Gaming',
      'epicgames.com': 'Gaming',
      'playstation.com': 'Gaming',
      'xbox.com': 'Gaming',
      'hdfcbank.com': 'Banking',
      'onlinesbi.sbi': 'Banking',
      'icicibank.com': 'Banking',
      'chase.com': 'Banking',
      'amazon.com': 'Shopping',
      'flipkart.com': 'Shopping',
      'github.com': 'Development',
      'gitlab.com': 'Development',
      'aws.amazon.com': 'Cloud Infra',
      'console.aws.amazon.com': 'Cloud Infra',
      'notion.so': 'Work',
      'slack.com': 'Work',
      'zoom.us': 'Work',
      'netflix.com': 'Entertainment',
      'spotify.com': 'Entertainment'
    }));

    this.blacklistTokens = new Set([
      'login', 'signin', 'account', 'secure', 'portal', 'online', 'web', 'app', 'home'
    ]);

    this.keywordRules = [
      { category: 'Banking', weight: 0.62, patterns: [/\bbank\b/i, /\bcredit\b/i, /\bloan\b/i, /\bfinance\b/i, /\bwealth\b/i, /\bupi\b/i, /\bcard\b/i] },
      { category: 'Email', weight: 0.65, patterns: [/\bmail\b/i, /\binbox\b/i, /\bemail\b/i, /\bwebmail\b/i] },
      { category: 'Gaming', weight: 0.68, patterns: [/\bsteam\b/i, /\bgame\b/i, /\bgaming\b/i, /\bplaystation\b/i, /\bxbox\b/i, /\bnintendo\b/i, /\bepic\b/i] },
      { category: 'Shopping', weight: 0.64, patterns: [/\bshop\b/i, /\bstore\b/i, /\bbuy\b/i, /\bcart\b/i, /\border\b/i, /\bmarket\b/i] },
      { category: 'Social Media', weight: 0.66, patterns: [/\bsocial\b/i, /\bchat\b/i, /\bcommunity\b/i, /\bfriends\b/i, /\bmessage\b/i] },
      { category: 'Education', weight: 0.69, patterns: [/\bschool\b/i, /\bcollege\b/i, /\buniversity\b/i, /\bstudent\b/i, /\bmoodle\b/i, /\bcourse\b/i] },
      { category: 'Work', weight: 0.61, patterns: [/\bworkspace\b/i, /\bteam\b/i, /\bemployee\b/i, /\bcompany\b/i, /\binternal\b/i, /\boffice\b/i] },
      { category: 'Development', weight: 0.7, patterns: [/\bdeveloper\b/i, /\bapi\b/i, /\bgit\b/i, /\brepository\b/i, /\bdeploy\b/i, /\bconsole\b/i] },
      { category: 'Cloud Infra', weight: 0.72, patterns: [/\bcloud\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i, /\bkubernetes\b/i, /\bdevops\b/i] },
      { category: 'Entertainment', weight: 0.63, patterns: [/\bstream\b/i, /\bmovie\b/i, /\bvideo\b/i, /\bmusic\b/i, /\bott\b/i] },
      { category: 'Travel', weight: 0.64, patterns: [/\bflight\b/i, /\bhotel\b/i, /\btrip\b/i, /\btravel\b/i, /\bbooking\b/i] },
      { category: 'Healthcare', weight: 0.67, patterns: [/\bhospital\b/i, /\bhealth\b/i, /\bclinic\b/i, /\bmedical\b/i, /\bdoctor\b/i] },
    ];
  }

  async categorizeNewEntry(entry) {
    return this.categorizeEntry(entry, { mode: 'new-entry' });
  }

  async categorizeEntry(entry, options = {}) {
    const normalized = this._normalizeEntry(entry);
    const signals = [];

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

  async planVaultOrganization(vaultItems, options = {}) {
    const includeCategorized = options.includeCategorized ?? true;
    const includeUncategorized = options.includeUncategorized ?? true;
    const createNewCategories = options.createNewCategories ?? this.allowNewCategories;

    const proposals = [];
    const clusterBuckets = new Map();

    for (const item of vaultItems) {
      const currentCategory = item.category || 'Uncategorized';
      const isUncategorized = currentCategory === 'Uncategorized';
      if ((!includeUncategorized && isUncategorized) || (!includeCategorized && !isUncategorized)) continue;

      const result = await this.categorizeEntry(item, { mode: 'organize-existing' });
      const proposal = this._buildItemProposal(item, result);
      proposals.push(proposal);

      const clusterKey = this._clusterKey(item);
      if (!clusterBuckets.has(clusterKey)) clusterBuckets.set(clusterKey, []);
      clusterBuckets.get(clusterKey).push({ item, result, proposal });
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

  applyApprovedOrganizationPlan(vaultItems, approvedPlan) {
    const categoryCreates = approvedPlan?.createCategories || [];
    const approvedItemChanges = approvedPlan?.itemChanges || [];

    for (const category of categoryCreates) {
      this.categories.add(category.name);
    }

    const itemMap = new Map(vaultItems.map(item => [item.id, { ...item }]));

    for (const change of approvedItemChanges) {
      const existing = itemMap.get(change.itemId);
      if (!existing) continue;
      existing.category = change.toCategory;
      existing.lastAutoOrganizedAt = new Date().toISOString();
      existing.lastAutoOrganizeReason = change.reason;
      itemMap.set(change.itemId, existing);
    }

    return Array.from(itemMap.values());
  }

  learnFromUserDecision({ domain, chosenCategory }) {
    const normalizedDomain = this._normalizeHostname(domain);
    if (!normalizedDomain || !chosenCategory) return;

    this.userOverrides.set(normalizedDomain, chosenCategory);

    const existing = this.userCategoryAffinities.get(chosenCategory) || 0;
    this.userCategoryAffinities.set(chosenCategory, existing + 1);
    this.categories.add(chosenCategory);
  }

  _buildItemProposal(item, result) {
    const currentCategory = item.category || 'Uncategorized';
    const proposedCategory = result.category;
    const sameCategory = currentCategory === proposedCategory;

    let changeType = 'none';
    let reason = 'No change suggested';
    let recommended = false;

    if (currentCategory === 'Uncategorized' && proposedCategory !== 'Uncategorized') {
      changeType = 'categorize';
      reason = `Categorize uncategorized item as ${proposedCategory}`;
      recommended = result.confidence >= this.suggestThreshold;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized' && result.confidence >= this.moveThreshold) {
      changeType = 'move';
      reason = `Move from ${currentCategory} to ${proposedCategory}`;
      recommended = true;
    } else if (!sameCategory && proposedCategory !== 'Uncategorized') {
      changeType = 'suggest-move';
      reason = `Possible better fit in ${proposedCategory}`;
      recommended = false;
    }

    return {
      itemId: item.id,
      title: item.title || item.appName || item.domain || item.username || 'Unknown item',
      domain: this._normalizeHostname(item.domain || item.url || ''),
      username: item.username || '',
      currentCategory,
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

  _detectNewCategoryCandidates(clusterBuckets) {
    const proposals = [];

    for (const [clusterKey, bucket] of clusterBuckets.entries()) {
      if (bucket.length < 3) continue;

      const domainTokens = clusterKey.split(':')[1]?.split('|').filter(Boolean) || [];
      if (domainTokens.length === 0) continue;

      const inferredName = this._titleCase(domainTokens[0]);
      if (!inferredName || this.categories.has(inferredName)) continue;

      const avgConfidence = bucket.reduce((sum, x) => sum + (x.result.confidence || 0), 0) / bucket.length;
      const distinctCurrentCategories = new Set(bucket.map(x => x.proposal.currentCategory));
      const uncategorizedCount = bucket.filter(x => x.proposal.currentCategory === 'Uncategorized').length;

      if (avgConfidence < this.newCategoryThreshold) continue;
      if (distinctCurrentCategories.size > 3 && uncategorizedCount < 2) continue;

      proposals.push({
        categoryName: inferredName,
        confidence: this._round(avgConfidence),
        basedOnItems: bucket.map(x => x.item.id),
        itemCount: bucket.length,
        reason: `Create new category ${inferredName} for similar items that cluster together`,
        approved: false
      });
    }

    return proposals;
  }

  _summarizePlan(itemProposals, newCategoryProposals) {
    const categorizeCount = itemProposals.filter(x => x.changeType === 'categorize').length;
    const moveCount = itemProposals.filter(x => x.changeType === 'move').length;
    const suggestMoveCount = itemProposals.filter(x => x.changeType === 'suggest-move').length;
    const unchangedCount = itemProposals.filter(x => x.changeType === 'none').length;

    return {
      totalReviewed: itemProposals.length,
      categorizeCount,
      moveCount,
      suggestMoveCount,
      unchangedCount,
      newCategoryCount: newCategoryProposals.length,
      autoCheckedCount: itemProposals.filter(x => x.approved).length
    };
  }

  _buildApplyPlan(itemProposals, newCategoryProposals) {
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

  _scoreUserOverride(entry) {
    const direct = this.userOverrides.get(entry.hostname);
    if (!direct) return null;
    return {
      category: direct,
      score: 1.0,
      source: 'user-override',
      evidence: [`User previously selected ${direct} for ${entry.hostname}`]
    };
  }

  _scoreTrustedDatabase(entry) {
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

  _scoreHeuristics(entry) {
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
      if (rule.category === 'Banking' && /bank|pay|finance|card/i.test(entry.hostname)) {
        score += 0.12;
        evidence.push('Financial token found in hostname');
      }
      if (rule.category === 'Email' && /mail/i.test(entry.hostname)) {
        score += 0.12;
        evidence.push('Mail token found in hostname');
      }
      if (rule.category === 'Gaming' && /steam|xbox|playstation|epic/i.test(entry.hostname)) {
        score += 0.14;
        evidence.push('Gaming token found in hostname');
      }

      if (/riverbank/i.test(entry.hostname) && rule.category === 'Banking') {
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
        category: 'Work',
        score: 0.74,
        source: 'heuristics',
        evidence: ['Support and ticket tokens indicate internal or work system']
      });
    }

    return signals;
  }

  _scoreUserHistory(entry) {
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

  async _scoreLocalAI(entry) {
    const result = await this.worker.classify({
      text: entry.contextText,
      labels: Array.from(this.categories).filter(x => x !== 'Uncategorized')
    });

    if (!result || !result.label) return null;
    return {
      category: result.label,
      score: this._clamp(result.score || 0, 0, 0.94),
      source: 'local-ai',
      evidence: ['Local AI fallback classified entry from contextual metadata']
    };
  }

  _mergeSignals(signals) {
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

  _rankCandidates(candidates) {
    return candidates
      .map(x => ({
        ...x,
        score: this._round(x.score),
        sources: Array.from(new Set(x.sources || [])),
        evidence: Array.from(new Set(x.evidence || [])).slice(0, 5)
      }))
      .sort((a, b) => b.score - a.score);
  }

  _finalizeDecision(entry, ranked, mode) {
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

  _normalizeEntry(entry) {
    const hostname = this._normalizeHostname(entry.domain || entry.url || entry.website || '');
    const appName = this._normalizeText(entry.appName || entry.name || '');
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

  _normalizeHostname(input) {
    if (!input) return '';
    try {
      const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return String(input).trim().toLowerCase().replace(/^www\./, '');
    }
  }

  _normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _tokenize(text) {
    return text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(x => x.trim())
      .filter(x => x && !this.blacklistTokens.has(x));
  }

  _rootDomain(hostname) {
    const parts = (hostname || '').split('.').filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  _clusterKey(item) {
    const hostname = this._normalizeHostname(item.domain || item.url || '');
    const root = this._rootDomain(hostname);
    const title = this._normalizeText(item.title || item.appName || '');
    const tokens = this._tokenize(`${root} ${title}`).slice(0, 3).sort();
    return `${root}:${tokens.join('|')}`;
  }

  _titleCase(input) {
    return String(input || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
      .join(' ');
  }

  _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  _round(value) {
    return Math.round(value * 100) / 100;
  }
}
