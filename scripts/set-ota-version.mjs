// Writes app_config/latest_version document to Firestore
// using firebase-tools' cached credentials (correct path).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const FIRETOOLS = 'C:/Users/mohdj/AppData/Local/npm-cache/_npx/ba4f1959e38407b5/node_modules/firebase-tools';
const fireauth = require(FIRETOOLS + '/lib/auth.js');

const account = fireauth.getGlobalDefaultAccount();
const accessToken = account.tokens?.access_token;

if (!accessToken) {
  console.error('❌ No access token found. Please run: npx firebase-tools login');
  process.exit(1);
}
console.log('Got access token for:', account.user?.email);

import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;

const PROJECT = 'vault-app-ba6e2';
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/app_config/latest_version`;

const body = {
  fields: {
    version:         { stringValue:  version },
    url:             { stringValue:  `https://${PROJECT}.web.app/bundles/${version}.zip` },
    critical:        { booleanValue: false },
    releaseNotes:    { stringValue:  `Release v${version}` },
    releasedAt:      { stringValue:  new Date().toISOString() },
    min_apk_version: { stringValue:  version },
    apk_download_url:{ stringValue:  `https://github.com/Mohd-afk/apk-releases/releases/download/v${version}/app-debug.apk` },
  }
};

console.log('Writing to Firestore: app_config/latest_version ...');
const resp = await fetch(url, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});

const json = await resp.json();

if (!resp.ok) {
  console.error('❌ Firestore REST API error:', JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log('✅ Firestore document written successfully!');
console.log('  version:', json.fields?.version?.stringValue);
console.log('  url:', json.fields?.url?.stringValue);
