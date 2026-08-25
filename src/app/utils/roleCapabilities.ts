// PURPOSE: Utility functions for roleCapabilities.
import { type CollectionRole } from '../firestore/collections';

export type Capability =
  | 'viewItems'
  | 'editItems'
  | 'inviteUsers'
  | 'revokeUsers'
  | 'rotateKeys'
  | 'deleteCollection'
  | 'transferOwnership';

const CAPABILITY_MATRIX: Record<CollectionRole, Set<Capability>> = {
  owner: new Set<Capability>([
    'viewItems',
    'editItems',
    'inviteUsers',
    'revokeUsers',
    'rotateKeys',
    'deleteCollection',
    'transferOwnership',
  ]),
  manager: new Set<Capability>([
    'viewItems',
    'editItems',
    'inviteUsers',
    'revokeUsers',
    'rotateKeys',
  ]),
  editor: new Set<Capability>([
    'viewItems',
    'editItems',
  ]),
  viewer: new Set<Capability>([
    'viewItems',
  ]),
};

/**
 * Checks if a collection role has a specific capability.
 */
export function hasCapability(role: CollectionRole, capability: Capability): boolean {
  const capabilities = CAPABILITY_MATRIX[role];
  return capabilities ? capabilities.has(capability) : false;
}

/**
 * Maps standard collection roles to modern user-facing labels.
 */
export function getRoleDisplayLabel(role: CollectionRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'editor':
      return 'Collaborator';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}
