// ─── Send In-App Broadcast Notification to All Users ──────────────────────────
// Usage Option A (Command Line):
//   node scripts/send-in-app-broadcast.mjs "Your Title Here" "Your Message Body Here"
//
// Usage Option B (Interactive Prompt):
//   node scripts/send-in-app-broadcast.mjs
//   (It will ask you to type your Title and Message)
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import readline from 'readline';

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

function promptInput(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(res => rl.question(query, ans => {
    rl.close();
    res(ans);
  }));
}

async function broadcastNotification() {
  let title = process.argv[2];
  let body = process.argv[3];

  if (!title) {
    title = await promptInput('📝 Enter Notification Title: ');
  }
  if (!body) {
    body = await promptInput('📝 Enter Notification Message/Body: ');
  }

  if (!title || !title.trim()) {
    console.error('❌ Title cannot be empty. Aborting.');
    process.exit(1);
  }

  if (!body || !body.trim()) {
    console.error('❌ Message body cannot be empty. Aborting.');
    process.exit(1);
  }

  console.log(`\n📢 Preparing Broadcast Notification:`);
  console.log(`   Title: "${title.trim()}"`);
  console.log(`   Body:  "${body.trim()}"\n`);

  const confirm = await promptInput('⚠️  Are you sure you want to send this in-app notification to ALL users? (y/n): ');
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ Cancelled by user. No notifications sent.');
    process.exit(0);
  }

  const db = admin.firestore();
  let pageToken;
  let count = 0;

  do {
    const listUsersResult = await admin.auth().listUsers(1000, pageToken);
    const batch = db.batch();

    for (const userRecord of listUsersResult.users) {
      const notifRef = db.collection('users').doc(userRecord.uid).collection('notifications').doc();
      batch.set(notifRef, {
        user_id: userRecord.uid,
        type: 'system',
        type_category: 'system',
        priority: 'high',
        title: title.trim(),
        body: body.trim(),
        status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        read_at: null,
        metadata: {
          broadcast: true,
          sent_at: new Date().toISOString()
        }
      });
      count++;
    }

    await batch.commit();
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`\n✅ Successfully sent in-app notification to all ${count} users!\n`);
  process.exit(0);
}

broadcastNotification().catch((err) => {
  console.error('❌ Error broadcasting notification:', err);
  process.exit(1);
});
