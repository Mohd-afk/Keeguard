import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const { VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID } = process.env;

if (!VITE_FIREBASE_API_KEY || !VITE_FIREBASE_PROJECT_ID) {
  console.error('❌ Missing VITE_FIREBASE_* env vars. Copy .env.example to .env.');
  process.exit(1);
}

const app = initializeApp({
    apiKey: VITE_FIREBASE_API_KEY,
    authDomain: VITE_FIREBASE_AUTH_DOMAIN,
    projectId: VITE_FIREBASE_PROJECT_ID,
    storageBucket: VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);

async function inspect() {
    try {
        console.log("--- Collection: usernames ---");
        const usernamesSnap = await getDocs(collection(db, 'usernames'));
        usernamesSnap.forEach(doc => {
            console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
        });

        console.log("--- Collection: userProfiles ---");
        const profilesSnap = await getDocs(collection(db, 'userProfiles'));
        profilesSnap.forEach(doc => {
            console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
        });

        console.log("--- Collection: users ---");
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach(doc => {
            console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
        });
    } catch (err) {
        console.error("Error:", err);
    }
}

inspect();
