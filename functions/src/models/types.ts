// ─── Shared Collections backend domain models ─────────────────────────────────

export type CollectionRole = 'owner' | 'manager' | 'editor' | 'viewer';
export type CollectionStatus = 'active' | 'archived';
export type MemberStatus = 'active' | 'removed';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface SharedCollection {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'shared';
  status: CollectionStatus;
  current_key_version: number;
  current_revision: number;
  created_at: any; // Firebase Firestore Timestamp
  updated_at: any;
}

export interface CollectionMember {
  id: string;
  collection_id: string;
  user_id: string;
  role: CollectionRole;
  status: MemberStatus;
  joined_at: any;
  added_by_user_id: string;
  created_at: any;
  updated_at: any;
}

export interface CollectionInvite {
  id: string;
  collection_id: string;
  invited_user_id: string;
  invited_by_user_id: string;
  role: Exclude<CollectionRole, 'owner'>;
  status: InviteStatus;
  message: string | null;
  expires_at: any;
  created_at: any;
  responded_at: any | null;
}

export interface CollectionItem {
  id: string;
  owner_type: 'collection';
  owner_id: string;
  title_enc: string;
  item_type: 'login' | 'card' | 'note' | 'identity' | 'wifi' | 'other';
  ciphertext: string;
  iv: string;
  auth_tag: string;
  item_key_version: number;
  base_revision: number;
  latest_revision: number;
  deleted_at: any | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: any;
  updated_at: any;
}

export interface CollectionKeyEnvelope {
  id: string;
  collection_id: string;
  collection_key_version: number;
  recipient_type: 'user' | 'device';
  recipient_id: string;
  wrapped_collection_key: string;
  sender_public_key_b64: string;
  created_at: any;
}

export interface SyncEvent {
  id: string;
  scope_type: 'collection';
  scope_id: string;
  event_type: string;
  revision: number;
  payload: Record<string, unknown>;
  created_at: any;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: 'invite_received' | 'invite_accepted' | 'member_removed' | 'security_alert' | 'system';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type_category: 'collaboration' | 'security' | 'system';
  title: string;
  body: string;
  status: 'pending' | 'read' | 'archived';
  created_at: any;
  read_at: any | null;
  metadata: {
    collection_id?: string;
    collection_name?: string;
    invite_id?: string;
    inviter_user_id?: string;
    inviter_username?: string;
    inviter_display_name?: string;
    device_id?: string;
    device_name?: string;
    ip_address?: string;
    [key: string]: any;
  };
}

export interface AuditEvent {
  id: string;
  event_type: string;
  collection_id: string;
  actor_user_id: string;
  details: string;
  metadata: Record<string, any>;
  created_at: any;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  user_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  metadata: Record<string, any>;
  created_at: any;
}
