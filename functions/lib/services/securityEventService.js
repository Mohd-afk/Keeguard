"use strict";
// ─── Security Event Logging Service ──────────────────────────────────────────
// Handles logging high-risk security alerts, intrusion detection, and anomalies.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSecurityEvent = void 0;
const admin = require("firebase-admin");
/**
 * Log a high-severity security event or potential abuse incident.
 */
async function logSecurityEvent(userId, eventType, severity, details, metadata = {}) {
    try {
        const db = admin.firestore();
        await db.collection('securityEvents').add({
            user_id: userId,
            event_type: eventType,
            severity,
            details,
            metadata,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        console.error('Failed to write security event', { userId, eventType, severity, err });
    }
}
exports.logSecurityEvent = logSecurityEvent;
//# sourceMappingURL=securityEventService.js.map