// PURPOSE: Scans staged git files before commit to prevent API key and credential leaks.
/**
 * 🔒 Local Pre-Commit Secret Scanner
 * This script automatically inspects staged git files before every commit to detect leaked API keys,
 * Firebase private keys, or passwords. It prevents accidental exposure of sensitive credentials in git history.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🔍 Running Local Pre-Commit Secret Scanner (OWASP Secrets Management Protocol)...');

const PATTERNS = [
  { name: 'Firebase Service Account Private Key', regex: /-----BEGIN PRIVATE KEY-----/ },
  { name: 'Generic Private Key', regex: /-----BEGIN RSA PRIVATE KEY-----/ },
  { name: 'GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Slack Webhook Token', regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Generic High Entropy Secret Passwords', regex: /(?:api_key|secret_key|private_key|password)\s*=\s*['"][a-zA-Z0-9\/+=]{20,}['"]/i }
];

let stagedFiles = [];
try {
  stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
    .split('\n')
    .filter(f => f.trim().length > 0 && fs.existsSync(f));
} catch (e) {
  console.log('⚠️  Not inside a git repository or git command unavailable. Skipping staged file scan.');
  process.exit(0);
}

let violationsFound = 0;

for (const file of stagedFiles) {
  if (file.endsWith('.lock') || file.includes('node_modules/') || file.includes('.mdfiles/')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(content)) {
      console.error(`❌ CRITICAL SECRET DETECTED in staged file: ${file}`);
      console.error(`   Violation Pattern: ${pattern.name}`);
      violationsFound++;
    }
  }
}

if (violationsFound > 0) {
  console.error(`\n🚨 Pre-commit scan failed! Found ${violationsFound} potential secret leak(s).`);
  console.error('   Please remove credentials or add them to environment variables (.env) before committing.');
  process.exit(1);
} else {
  console.log('✅ Secret Scan Passed — No credentials detected in staged files.\n');
  process.exit(0);
}
