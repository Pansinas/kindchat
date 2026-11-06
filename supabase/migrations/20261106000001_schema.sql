-- Pairvella core schema.
-- Conventions: uuid PKs, snake_case, timestamptz, text + CHECK for statuses.
-- `public` is exposed through the Data API and always protected by RLS.
-- `private` is NOT exposed and holds secrets/mappings; it is reached only through
-- SECURITY DEFINER functions.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Identity & profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  display_name  text not null,
  avatar_path   text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 160),
  constraint profiles_avatar_path_len check (avatar_path is null or char_length(avatar_path) <= 200)
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

create table private.reserved_usernames (
  username_lower text primary key
);
insert into private.reserved_usernames (username_lower) values
  ('admin'), ('administrator'), ('root'), ('system'), ('support'), ('help'), ('helpdesk'),
  ('pairvella'), ('official'), ('staff'), ('team'), ('moderator'), ('mod'), ('security'),
  ('api'), ('null'), ('undefined'), ('anonymous'), ('everyone'), ('owner'), ('billing'),
  ('login'), ('logout'), ('register'), ('signup'), ('signin'), ('settings'), ('invite'),
  ('dashboard'), ('chat'), ('connect'), ('onboarding'), ('privacy'), ('terms'), ('legal'),
  ('noreply'), ('no_reply'), ('postmaster'), ('webmaster'), ('abuse');

-- Private mapping between a user and their opaque Supabase Auth identity.
create table private.private_auth_mapping (
  user_id                    uuid primary key references auth.users (id) on delete cascade,
  auth_email                 text not null unique,
  recovery_email             extensions.citext,
  recovery_email_verified_at timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table private.email_verification_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  token_hash  bytea not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index email_verification_tokens_user on private.email_verification_tokens (user_id);

create table public.user_settings (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  show_online_status       boolean not null default true,
  show_last_seen           boolean not null default true,
  discoverable_by_username boolean not null default true,
  theme                    text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_sound             boolean not null default true,
  notify_desktop           boolean not null default false,
  updated_at               timestamptz not null default now()
);

create table public.user_activity (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Couples & pairing
-- ---------------------------------------------------------------------------

create table public.couple_spaces (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'active' check (status in ('active', 'ended', 'purged')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid references public.profiles (id) on delete set null,
  end_reason  text check (end_reason in ('disconnect', 'account_deleted', 'admin')),
  purge_after timestamptz,
  purged_at   timestamptz,
  constraint couple_spaces_end_consistency check (
    (status = 'active' and ended_at is null) or (status <> 'active' and ended_at is not null)
  )
);

create table public.couple_members (
  id              uuid primary key default gen_random_uuid(),
  couple_space_id uuid not null references public.couple_spaces (id) on delete cascade,
  user_id         uuid references public.profiles (id) on delete set null,
  slot            smallint not null check (slot in (1, 2)),
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  -- A couple space can never hold more than two members.
  constraint couple_members_slot_unique unique (couple_space_id, slot),
  constraint couple_members_user_once unique (couple_space_id, user_id)
);
-- A user can be an active member of at most one couple space.
create unique index couple_members_one_active_per_user
  on public.couple_members (user_id) where left_at is null;
create index couple_members_space on public.couple_members (couple_space_id);

create table public.connection_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'superseded')),
  couple_space_id uuid references public.couple_spaces (id) on delete set null,
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  expires_at      timestamptz not null default now() + interval '14 days',
  constraint connection_requests_not_self check (requester_id <> recipient_id)
);
create unique index connection_requests_one_pending_per_pair
  on public.connection_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status = 'pending';
create index connection_requests_recipient_pending on public.connection_requests (recipient_id) where status = 'pending';
create index connection_requests_requester_pending on public.connection_requests (requester_id) where status = 'pending';

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  inviter_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash      bytea not null unique,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'revoked', 'expired', 'superseded')),
  accepted_by     uuid references public.profiles (id) on delete set null,
  couple_space_id uuid references public.couple_spaces (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  constraint invitations_not_self check (accepted_by is null or accepted_by <> inviter_id)
);
create unique index invitations_one_pending_per_inviter on public.invitations (inviter_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  couple_space_id  uuid not null unique references public.couple_spaces (id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_message_seq bigint not null default 0,
  last_message_at  timestamptz
);

create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity unique,
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  sender_id         uuid references public.profiles (id) on delete set null,
  client_message_id uuid not null,
  kind              text not null default 'text' check (kind in ('text')),
  body              text,
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  deleted_at        timestamptz,
  constraint messages_body_rules check (
    (deleted_at is not null and body is null)
    or (deleted_at is null and kind = 'text'
        and char_length(btrim(body, E' \t\r\n')) between 1 and 5000)
  ),
  constraint messages_client_id_unique unique (conversation_id, client_message_id)
);
create index messages_conversation_seq on public.messages (conversation_id, seq desc);
create index messages_sender on public.messages (sender_id);

-- Receipt cursors (watermarks): one row per member per conversation.
create table public.message_reads (
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  last_delivered_seq bigint not null default 0,
  last_delivered_at  timestamptz,
  last_read_seq      bigint not null default 0,
  last_read_at       timestamptz,
  primary key (conversation_id, user_id),
  constraint message_reads_read_le_delivered check (last_read_seq <= last_delivered_seq)
);
create index message_reads_user on public.message_reads (user_id);

create table public.saved_messages (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index saved_messages_message on public.saved_messages (message_id);

-- ---------------------------------------------------------------------------
-- Safety, moderation, operations
-- ---------------------------------------------------------------------------

create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);
create index blocked_users_blocked on public.blocked_users (blocked_id);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.profiles (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason           text not null check (reason in ('harassment', 'spam', 'impersonation', 'unsafe', 'other')),
  details          text check (details is null or char_length(details) <= 1000),
  status           text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid
);
create index reports_reporter on public.reports (reporter_id);
create index reports_reported on public.reports (reported_user_id);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  event_type  text not null,
  target_type text,
  target_id   uuid,
  ip_hash     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_actor_time on public.audit_logs (actor_id, created_at desc);

create table private.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

create table private.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('support', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function private.touch_updated_at();
create trigger private_auth_mapping_updated_at before update on private.private_auth_mapping
  for each row execute function private.touch_updated_at();
