// ─── Send In-App Broadcast Notification to All Users ──────────────────────────
// Run: node scripts/send-in-app-broadcast.mjs "Title" "Body Message"
// Example: node scripts/send-in-app-broadcast.mjs "🚀 New Update v5.0.1 Live" "Please update your app to get the latest performance fixes!"
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
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

const title = process.argv[2] || "⚠️ System Announcement";
const body = process.argv[3] || "Scheduled maintenance will take place soon. Thank you for your patience!";

async function broadcastNotification() {
  console.log(`\n📢 Preparing Broadcast Notification:`);
  console.log(`   Title: "${title}"`);
  console.log(`   Body:  "${body}"\n`);

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
        title: title,
        body: body,
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

  console.log(`✅ Successfully sent in-app notification to all ${count} users!\n`);
  process.exit(0);
}

broadcastNotification().catch((err) => {
  console.error('❌ Error broadcasting notification:', err);
  process.exit(1);
});
