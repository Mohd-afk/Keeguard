// ─── Access Control & Role Enforcement Service ───────────────────────────────
// Verifies roles and permissions for shared collections.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin';
import { CollectionRole } from '../models/types';

/**
 * Check if a user is an active member of a collection and return their role.
 * Throws an error if they are not authorized or are not an active member.
 */
export async function verifyMemberAccess(
  collectionId: string,
  userId: string,
  requiredRoles: CollectionRole[]
): Promise<CollectionRole> {
  const db = admin.firestore();
  
  // First verify collection exists
  const collSnap = await db.collection('collections').doc(collectionId).get();
  if (!collSnap.exists) {
    throw new Error('NOT_FOUND: Collection does not exist');
  }

  // Verify access using the folder_shares collection
  const shareSnap = await db.collection('folder_shares').doc(`${collectionId}_${userId}`).get();
  if (!shareSnap.exists) {
    throw new Error('PERMISSION_DENIED: User is not authorized for this folder');
  }

  const shareData = shareSnap.data()!;
  if (shareData.status !== 'accepted') {
    throw new Error('PERMISSION_DENIED: Share request has not been accepted');
  }

  const memberSnap = await db
    .collection('collections')
    .doc(collectionId)
    .collection('members')
    .doc(userId)
    .get();

  if (!memberSnap.exists) {
    throw new Error('PERMISSION_DENIED: User is not a member of this collection');
  }

  const memberData = memberSnap.data()!;
  if (memberData.status !== 'active') {
    throw new Error('PERMISSION_DENIED: Membership is not active');
  }

  const userRole = memberData.role as CollectionRole;

  if (requiredRoles.length > 0 && !requiredRoles.includes(userRole)) {
    throw new Error(`PERMISSION_DENIED: Required roles: [${requiredRoles.join(', ')}], user has role: ${userRole}`);
  }

  // Ensure collaborator roles mapped properly
  if (requiredRoles.includes('owner') || requiredRoles.includes('manager') || requiredRoles.includes('editor')) {
    if (shareData.role !== 'collaborator') {
      throw new Error('PERMISSION_DENIED: Collaborator role required for write operations');
    }
  }

  return userRole;
}

/**
 * Compares two roles according to the hierarchy.
 * Returns true if role A has higher authority than role B.
 */
export function hasHigherAuthority(roleA: CollectionRole, roleB: CollectionRole): boolean {
  const hierarchy: Record<CollectionRole, number> = {
    owner: 4,
    manager: 3,
    editor: 2,
    viewer: 1,
  };
  return hierarchy[roleA] > hierarchy[roleB];
}

/**
 * Validates if actor can modify target member's role or remove them.
 */
export async function canModifyMember(
  collectionId: string,
  actorUserId: string,
  targetUserId: string
): Promise<void> {
  if (actorUserId === targetUserId) {
    // A member can always remove themselves (leave collection), unless they are the owner
    const role = await verifyMemberAccess(collectionId, actorUserId, []);
    if (role === 'owner') {
      throw new Error('PERMISSION_DENIED: Owner cannot leave collection without transferring ownership');
    }
    return;
  }

  const actorRole = await verifyMemberAccess(collectionId, actorUserId, ['owner', 'manager']);
  
  const targetSnap = await admin.firestore()
    .collection('collections')
    .doc(collectionId)
    .collection('members')
    .doc(targetUserId)
    .get();

  if (!targetSnap.exists) {
    throw new Error('NOT_FOUND: Target member does not exist');
  }

  const targetRole = targetSnap.data()!.role as CollectionRole;

  if (!hasHigherAuthority(actorRole, targetRole)) {
    throw new Error(`PERMISSION_DENIED: Cannot modify a member with equal or higher authority (${actorRole} vs ${targetRole})`);
  }
}

export type BackendCapability =
  | 'viewItems'
  | 'editItems'
  | 'inviteUsers'
  | 'revokeUsers'
  | 'rotateKeys'
  | 'deleteCollection'
  | 'transferOwnership';

const BACKEND_CAPABILITY_MATRIX: Record<CollectionRole, BackendCapability[]> = {
  owner: ['viewItems', 'editItems', 'inviteUsers', 'revokeUsers', 'rotateKeys', 'deleteCollection', 'transferOwnership'],
  manager: ['viewItems', 'editItems', 'inviteUsers', 'revokeUsers', 'rotateKeys'],
  editor: ['viewItems', 'editItems'],
  viewer: ['viewItems'],
};

/**
 * Checks if a role has the required capability.
 */
export function hasCapability(role: CollectionRole, capability: BackendCapability): boolean {
  const allowed = BACKEND_CAPABILITY_MATRIX[role];
  return allowed ? allowed.includes(capability) : false;
}

/**
 * Verifies if a user has the required capability within a collection.
 * Throws a Permission Denied error if the check fails.
 */
export async function verifyMemberCapability(
  collectionId: string,
  userId: string,
  capability: BackendCapability
): Promise<CollectionRole> {
  const role = await verifyMemberAccess(collectionId, userId, []);
  if (!hasCapability(role, capability)) {
    throw new Error(`PERMISSION_DENIED: User ${userId} lacks capability ${capability} (has role: ${role})`);
  }
  return role;
}
