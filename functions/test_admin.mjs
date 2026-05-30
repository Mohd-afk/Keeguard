import admin from 'firebase-admin';

// Initialize the app without credentials to see if it works in the functions environment
// or we can just require the service account if one is present.
// Since we are running locally, we might need a dummy service account or it will fail.
// Wait, is there a firebase-admin emulator running?
console.log("Trying to list collections...");
