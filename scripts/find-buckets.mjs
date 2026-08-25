// PURPOSE: Automated maintenance and release script for find-buckets.mjs.
import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { Storage } from '@google-cloud/storage';

const ROOT = resolve(import.meta.dirname, '..');
const files = readdirSync(ROOT);
const serviceAccountFile = files.find(f => f.startsWith('vault-app-ba6e2-') && f.endsWith('.json'));

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const storage = new Storage({
  projectId: serviceAccount.project_id,
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key
  }
});

try {
  const [buckets] = await storage.getBuckets();
  console.log('Available buckets:', buckets.map(b => b.name));
} catch(e) {
  console.error('Error getting buckets:', e.message);
}
process.exit(0);
