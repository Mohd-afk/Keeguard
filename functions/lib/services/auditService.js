"use strict";
// ─── Audit Logging Service ───────────────────────────────────────────────────
// Handles logging of non-repudiable audit events for sensitive collection operations.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = void 0;
const admin = require("firebase-admin");
/**
 * Log a shared collection audit event in Firestore.
 */
async function logAuditEvent(collectionId, actorUserId, eventType, details, metadata = {}) {
    try {
        const db = admin.firestore();
        await db.collection('auditEvents').add({
            collection_id: collectionId,
            actor_user_id: actorUserId,
            event_type: eventType,
            details,
            metadata,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        console.error('Failed to write audit log event', { collectionId, actorUserId, eventType, err });
    }
}
exports.logAuditEvent = logAuditEvent;
//# sourceMappingURL=auditService.js.map