"use strict";
// ─── Invites Route / Callables ────────────────────────────────────────────────
// Endpoints for sending, accepting, declining, and revoking invites.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeInvite = exports.declineInvite = exports.acceptInvite = exports.createInvite = void 0;
const functions = require("firebase-functions");
const inviteService_1 = require("../services/inviteService");
function checkAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    return context.auth.uid;
}
exports.createInvite = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, targetUsername, role, message } = data;
    if (!collectionId || !targetUsername || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, targetUsername, role.');
    }
    try {
        const inviteId = await (0, inviteService_1.createCollectionInvite)(collectionId, actorUserId, targetUsername, role, message || null);
        return { success: true, inviteId };
    }
    catch (err) {
        console.error('Error in createInvite:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to create invite');
    }
});
exports.acceptInvite = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, inviteId } = data;
    if (!collectionId || !inviteId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, inviteId.');
    }
    try {
        await (0, inviteService_1.acceptCollectionInvite)(collectionId, actorUserId, inviteId);
        return { success: true };
    }
    catch (err) {
        console.error('Error in acceptInvite:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to accept invite');
    }
});
exports.declineInvite = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, inviteId } = data;
    if (!collectionId || !inviteId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, inviteId.');
    }
    try {
        await (0, inviteService_1.declineCollectionInvite)(collectionId, actorUserId, inviteId);
        return { success: true };
    }
    catch (err) {
        console.error('Error in declineInvite:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to decline invite');
    }
});
exports.revokeInvite = functions.https.onCall(async (data, context) => {
    const actorUserId = checkAuth(context);
    const { collectionId, inviteId } = data;
    if (!collectionId || !inviteId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required arguments: collectionId, inviteId.');
    }
    try {
        await (0, inviteService_1.revokeCollectionInvite)(collectionId, actorUserId, inviteId);
        return { success: true };
    }
    catch (err) {
        console.error('Error in revokeInvite:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to revoke invite');
    }
});
//# sourceMappingURL=invites.js.map