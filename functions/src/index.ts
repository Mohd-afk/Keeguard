// ─── Firebase Cloud Functions Entry Point ─────────────────────────────────────
// Initializes the Admin SDK and exports all callables & triggers.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';

// Initialize Admin SDK
admin.initializeApp();

// Export routes & endpoints
export { searchUsers } from './routes/users';
export { createInvite, acceptInvite, declineInvite, revokeInvite } from './routes/invites';
export { updateMemberRole, removeMember } from './routes/members';
export { createCollection } from './routes/collections';
export { commitItem } from './routes/items';
export { markNotificationRead } from './routes/notifications';
export { sendDeveloperNotification } from './routes/internalNotifications';

// Export background database triggers
export { onMemberRemoved, onNewDeviceRegistered } from './routes/triggers';
