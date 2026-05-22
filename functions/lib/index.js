"use strict";
// ─── Firebase Cloud Functions Entry Point ─────────────────────────────────────
// Initializes the Admin SDK and exports all callables & triggers.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewDeviceRegistered = exports.onMemberRemoved = exports.sendDeveloperNotification = exports.markNotificationRead = exports.commitItem = exports.createCollection = exports.removeMember = exports.updateMemberRole = exports.revokeInvite = exports.declineInvite = exports.acceptInvite = exports.createInvite = exports.searchUsers = void 0;
const admin = require("firebase-admin");
// Initialize Admin SDK
admin.initializeApp();
// Export routes & endpoints
var users_1 = require("./routes/users");
Object.defineProperty(exports, "searchUsers", { enumerable: true, get: function () { return users_1.searchUsers; } });
var invites_1 = require("./routes/invites");
Object.defineProperty(exports, "createInvite", { enumerable: true, get: function () { return invites_1.createInvite; } });
Object.defineProperty(exports, "acceptInvite", { enumerable: true, get: function () { return invites_1.acceptInvite; } });
Object.defineProperty(exports, "declineInvite", { enumerable: true, get: function () { return invites_1.declineInvite; } });
Object.defineProperty(exports, "revokeInvite", { enumerable: true, get: function () { return invites_1.revokeInvite; } });
var members_1 = require("./routes/members");
Object.defineProperty(exports, "updateMemberRole", { enumerable: true, get: function () { return members_1.updateMemberRole; } });
Object.defineProperty(exports, "removeMember", { enumerable: true, get: function () { return members_1.removeMember; } });
var collections_1 = require("./routes/collections");
Object.defineProperty(exports, "createCollection", { enumerable: true, get: function () { return collections_1.createCollection; } });
var items_1 = require("./routes/items");
Object.defineProperty(exports, "commitItem", { enumerable: true, get: function () { return items_1.commitItem; } });
var notifications_1 = require("./routes/notifications");
Object.defineProperty(exports, "markNotificationRead", { enumerable: true, get: function () { return notifications_1.markNotificationRead; } });
var internalNotifications_1 = require("./routes/internalNotifications");
Object.defineProperty(exports, "sendDeveloperNotification", { enumerable: true, get: function () { return internalNotifications_1.sendDeveloperNotification; } });
// Export background database triggers
var triggers_1 = require("./routes/triggers");
Object.defineProperty(exports, "onMemberRemoved", { enumerable: true, get: function () { return triggers_1.onMemberRemoved; } });
Object.defineProperty(exports, "onNewDeviceRegistered", { enumerable: true, get: function () { return triggers_1.onNewDeviceRegistered; } });
//# sourceMappingURL=index.js.map