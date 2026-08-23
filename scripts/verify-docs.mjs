/**
 * Documentation Drift Verification Engine (`npm run doc:check`)
 * Parses uncommitted git diffs against `.mdfiles/MANIFEST.json` subsystem rules to detect code modifications without matching documentation updates.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = join(ROOT, '.mdfiles', 'MANIFEST.json');

if (!existsSync(MANIFEST_PATH)) {
  console.error('❌ Documentation manifest .mdfiles/MANIFEST.json not found!');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

// Get modified files from git status / diff
let changedFiles = [];
try {
  const gitOutput = execSync('git status --short -u', { cwd: ROOT, encoding: 'utf-8' });
  changedFiles = gitOutput
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => line.slice(3).trim().replace(/^"|"$/g, ''));
} catch (err) {
  console.log('⚠️ Warning: Not a git repository or git command failed.');
  process.exit(0);
}

if (changedFiles.length === 0) {
  console.log('✅ No uncommitted changes detected. Documentation is up to date.');
  process.exit(0);
}

console.log('🔍 Checking documentation drift against changed files...');
const staleDocs = new Set();
const impactedSubsystems = [];

for (const [key, subsystem] of Object.entries(manifest.subsystems)) {
  const patterns = subsystem.paths;
  const isSubsystemChanged = changedFiles.some(file => {
    return patterns.some(pattern => {
      const cleanPattern = pattern.replace('/*', '').replace('*', '');
      return file.startsWith(cleanPattern) || file === cleanPattern;
    });
  });

  if (isSubsystemChanged) {
    impactedSubsystems.push(subsystem.name);
    // Check if mapped docs were updated in the diff
    subsystem.docs.forEach(docPath => {
      const isDocUpdated = changedFiles.includes(docPath);
      if (!isDocUpdated) {
        staleDocs.add({ doc: docPath, subsystem: subsystem.name, impact: subsystem.impact });
      }
    });
  }
}

if (staleDocs.size === 0) {
  console.log('✨ All impacted subsystems have matching documentation updates verified!');
} else {
  console.log('\n⚠️  POTENTIAL DOCUMENTATION DRIFT DETECTED:');
  console.log('The following code subsystems were modified without updating their mapped documentation:\n');
  staleDocs.forEach(item => {
    console.log(`  • Doc File: ${item.doc}`);
    console.log(`    Subsystem: ${item.subsystem} (Impact level: ${item.impact.toUpperCase()})\n`);
  });
  console.log('💡 Tip: Review the above documentation files and update them if behavior changed.');
}

process.exit(0);
