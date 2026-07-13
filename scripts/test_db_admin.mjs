import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const sa = JSON.parse(readFileSync(join(import.meta.dirname, '../vault-app-ba6e2-firebase-adminsdk-fbsvc-6c4a261f81.json'), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(sa)
});

const db = admin.firestore();

async function inspect() {
  try {
    console.log("--- Collection: usernames ---");
    const usernamesSnap = await db.collection('usernames').get();
    usernamesSnap.forEach(doc => {
      console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
    });

    console.log("--- Collection: userProfiles ---");
    const profilesSnap = await db.collection('userProfiles').get();
    profilesSnap.forEach(doc => {
      console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
    });

    console.log("--- Collection: users ---");
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach(doc => {
      console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

inspect();
