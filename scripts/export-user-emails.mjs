// ─── Export All User Emails from Firebase Auth ────────────────────────────────
// Run: node scripts/export-user-emails.mjs
// Exports all user email addresses to `user_emails.txt` and `user_emails.csv`
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const rootFiles = readdirSync(ROOT);
const serviceAccountFile = rootFiles.find(
  f => f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json')
);

if (!serviceAccountFile) {
  console.error('❌ Service account not found in project root');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function exportUserEmails() {
  console.log('\n🔍 Fetching user list from Firebase Authentication...\n');
  const emails = [];
  let pageToken;

  do {
    const listUsersResult = await admin.auth().listUsers(1000, pageToken);
    listUsersResult.users.forEach((userRecord) => {
      if (userRecord.email) {
        emails.push({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || '',
          creationTime: userRecord.metadata.creationTime,
        });
      }
    });
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`✅ Total Users Found with Emails: ${emails.length}`);

  if (emails.length === 0) {
    console.log('⚠️ No user emails found in Firebase Auth.');
    process.exit(0);
  }

  // Save to simple TXT file (one email per line — easy for copy-pasting to Gmail BCC)
  const txtContent = emails.map(u => u.email).join('\n');
  const txtPath = join(ROOT, 'user_emails.txt');
  writeFileSync(txtPath, txtContent, 'utf-8');

  // Save to CSV file (includes UID, Display Name, Email, Joined Date)
  const csvHeader = 'UID,Email,DisplayName,CreationTime\n';
  const csvRows = emails.map(u => `"${u.uid}","${u.email}","${u.displayName}","${u.creationTime}"`).join('\n');
  const csvPath = join(ROOT, 'user_emails.csv');
  writeFileSync(csvPath, csvHeader + csvRows, 'utf-8');

  console.log(`\n📄 Saved TXT (Emails list): ${txtPath}`);
  console.log(`📊 Saved CSV (Full Details): ${csvPath}\n`);

  console.log('--- Email List Preview (First 10) ---');
  emails.slice(0, 10).forEach(u => console.log(` - ${u.email} (${u.displayName || 'No name'})`));
  console.log('-------------------------------------\n');

  process.exit(0);
}

exportUserEmails().catch((err) => {
  console.error('❌ Error exporting user emails:', err);
  process.exit(1);
});
