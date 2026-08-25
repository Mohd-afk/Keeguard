// PURPOSE: Automated maintenance and release script for test_db_admin.mjs.
import 'dotenv/config';
import admin from 'firebase-admin';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Missing FIREBASE_* environment variables in .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  })
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
