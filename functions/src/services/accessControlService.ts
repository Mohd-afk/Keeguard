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
