import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
    apiKey:            'AIzaSyDsAH9mhH9IFYLyEjqKfy7uTnNRbU7Mg00',
    authDomain:        'vault-app-ba6e2.firebaseapp.com',
    projectId:         'vault-app-ba6e2',
    storageBucket:     'vault-app-ba6e2.firebasestorage.app',
    messagingSenderId: '1087322543080',
    appId:             '1:1087322543080:web:a1fa522bdcb3e3518b8a5d',
};

const app = initializeApp(firebaseConfig);
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
