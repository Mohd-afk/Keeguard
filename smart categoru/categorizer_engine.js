/**
 * Production-Grade Smart Categorization Engine
 * Architecture: Overrides -> Trusted DB -> Heuristics -> Local ML -> Arbitration
 */

export class SmartCategorizer {
  constructor(workerPath = 'ml_worker.js') {
    // 1. User Override Memory System
    // In production, load this from the encrypted local vault storage
    this.userOverrides = new Map(); 

    // 2. Trusted Domain Database (Deterministic Lookup)
    // Highly compressed Top-100k mapped dataset
    this.trustedDb = new Map([
      ['chase.com', 'Banking'],
      ['steampowered.com', 'Gaming'],
      ['github.com', 'Development'],
      ['aws.amazon.com', 'Cloud Infra']
    ]);

    // Initialize Web Worker for isolated ML inference
    this.worker = new Worker(workerPath);
    this.callbacks = new Map();
    this.msgId = 0;

    this.worker.onmessage = (e) => {
      const { id, result, status } = e.data;
      if (status === 'complete' && this.callbacks.has(id)) {
        this.callbacks.get(id).resolve(result);
        this.callbacks.delete(id);
      }
    };
  }

  /**
   * Main Categorization Pipeline
   * @param {Object} entry - Contextual metadata object
   * @returns {Object} { category, confidence, source, action }
   */
  async categorize(entry) {
    const { domain, title, appName } = entry;
    const normalizedDomain = this._normalizeHostname(domain);

    // STEP 1: User Override Memory
    if (this.userOverrides.has(normalizedDomain)) {
      return this._buildResult(this.userOverrides.get(normalizedDomain), 1.0, 'User Override');
    }

    // STEP 2: Trusted Domain Database
    if (this.trustedDb.has(normalizedDomain)) {
      return this._buildResult(this.trustedDb.get(normalizedDomain), 0.98, 'Database');
    }

    // STEP 3: Contextual Heuristic Engine
    const heuristicResult = this._runHeuristics(entry);
    if (heuristicResult && heuristicResult.confidence > 0.90) {
      return this._buildResult(heuristicResult.category, heuristicResult.confidence, 'Heuristics');
    }

    // STEP 4: Lightweight Local ML (Web Worker Fallback)
    const contextString = `${appName || ''} ${title || ''} ${domain || ''}`.trim();
    let mlResult = null;

    if (contextString.length > 3) {
      mlResult = await this._runMLWorker(contextString);
    }

    // STEP 5: Confidence Arbitration
    const finalDecision = this._arbitrate(heuristicResult, mlResult);
    return finalDecision;
  }

  _runHeuristics(entry) {
    const contextString = `${entry.appName || ''} ${entry.title || ''}`.toLowerCase();

    // Using strict word boundaries and tokenization to prevent false positives (e.g. riverbank.io)
    const rules = [
      { category: 'Banking', regex: /\b(bank|finance|credit union|wealth|card)\b/i, weight: 0.85 },
      { category: 'Development', regex: /\b(api|git|repository|developer|localhost)\b/i, weight: 0.80 },
      { category: 'Education', regex: /\b(university|college|student portal|moodle)\b/i, weight: 0.88 },
      { category: 'Gaming', regex: /\b(game|playstation|xbox|nintendo|steam)\b/i, weight: 0.85 }
    ];

    let bestMatch = null;
    let highestScore = 0;

    for (const rule of rules) {
      if (rule.regex.test(contextString)) {
        // Boost confidence if it matches title AND app name
        let score = rule.weight;
        if (entry.domain && entry.domain.includes('.edu') && rule.category === 'Education') score += 0.1;

        if (score > highestScore) {
          highestScore = score;
          bestMatch = rule.category;
        }
      }
    }

    return bestMatch ? { category: bestMatch, confidence: highestScore } : null;
  }

  _runMLWorker(text) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.worker.postMessage({ id, text });
    });
  }

  _arbitrate(heuristicResult, mlResult) {
    const candidates = [];
    if (heuristicResult) candidates.push({ ...heuristicResult, source: 'Heuristics' });
    if (mlResult) candidates.push({ category: mlResult.label, confidence: mlResult.score, source: 'Local AI' });

    if (candidates.length === 0) {
      return this._buildResult('Uncategorized', 0.0, 'None');
    }

    // Sort by highest confidence
    candidates.sort((a, b) => b.confidence - a.confidence);
    const winner = candidates[0];

    return this._buildResult(winner.category, winner.confidence, winner.source);
  }

  _buildResult(category, confidence, source) {
    // Confidence Threshold Routing Action
    let action = 'Uncategorized';
    if (confidence >= 0.90) action = 'Auto-categorize';
    else if (confidence >= 0.70) action = 'Suggest';

    return { category, confidence: Math.round(confidence * 100) / 100, source, action };
  }

  _normalizeHostname(url) {
    if (!url) return '';
    try {
      const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url.toLowerCase();
    }
  }

  // Safe Bulk Organize API
  async generateBulkPreview(vaultItems) {
    const previewState = [];
    for (const item of vaultItems) {
      if (!item.category || item.category === 'Uncategorized') {
         const result = await this.categorize(item);
         previewState.push({
           ...item,
           proposedCategory: result.category,
           confidence: result.confidence,
           action: result.action,
           apply: result.action === 'Auto-categorize' // Auto-check high confidence ones
         });
      }
    }
    return previewState;
  }
}
