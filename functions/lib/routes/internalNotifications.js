"use strict";
// ─── Internal Notifications / HTTP Endpoint ──────────────────────────────────
// Allows secure, service-to-service notification delivery via HTTPS.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDeveloperNotification = void 0;
const functions = require("firebase-functions");
const notificationService_1 = require("../services/notificationService");
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'developer_internal_token_secure_v2';
exports.sendDeveloperNotification = functions.https.onRequest(async (req, res) => {
    // 1. Authenticate using Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' });
        return;
    }
    const token = authHeader.split('Bearer ')[1];
    if (token !== SERVICE_TOKEN) {
        res.status(403).json({ error: 'Forbidden: Invalid token' });
        return;
    }
    // 2. Validate payload
    const { userId, type, priority, typeCategory, title, body, metadata } = req.body;
    if (!userId || !type || !priority || !typeCategory || !title || !body) {
        res.status(400).json({ error: 'Bad Request: Missing required body fields' });
        return;
    }
    try {
        // 3. Dispatch notification
        const notificationId = await (0, notificationService_1.sendNotification)(userId, {
            type,
            priority,
            type_category: typeCategory,
            title,
            body,
            metadata: metadata || {},
        });
        res.status(200).json({ success: true, notificationId });
    }
    catch (err) {
        console.error('Error in sendDeveloperNotification:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});
//# sourceMappingURL=internalNotifications.js.map