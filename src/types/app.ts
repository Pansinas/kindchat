/** Shapes returned by Postgres RPCs (see supabase/migrations/*_functions.sql). */

export interface ProfileCard {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
}

export interface MyProfile extends ProfileCard {
  bio: string | null;
  created_at: string;
}

export interface UserSettings {
  show_online_status: boolean;
  show_last_seen: boolean;
  discoverable_by_username: boolean;
  theme: "system" | "light" | "dark";
  notify_sound: boolean;
  notify_desktop: boolean;
  updated_at: string;
}

export interface CoupleInfo {
  couple_space_id: string;
  conversation_id: string;
  paired_since: string;
  partner: ProfileCard & { bio: string | null };
}

export interface ConnectionRequestItem {
  id: string;
  created_at: string;
  user: ProfileCard;
}

export interface MyState {
  profile: MyProfile;
  settings: UserSettings;
  couple: CoupleInfo | null;
  incoming_requests: ConnectionRequestItem[];
  outgoing_requests: ConnectionRequestItem[];
  invitation: { id: string; created_at: string; expires_at: string } | null;
  ended_couple: { couple_space_id: string; ended_at: string; purge_after: string; end_reason: string } | null;
}

export interface SearchResult extends ProfileCard {
  relation: "none" | "outgoing_pending" | "incoming_pending";
}

export interface PartnerStatus {
  partner_id: string;
  last_seen_at: string | null;
  last_seen_visible: boolean;
}
