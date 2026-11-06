-- Access control: helper functions, privileges and Row Level Security.
-- Principle: deny by default. Writes to pairing/messaging tables happen only through
-- SECURITY DEFINER RPCs (see 0003); clients get the narrowest direct privileges possible.

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies don't recurse through RLS).
-- ---------------------------------------------------------------------------

create function private.try_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
    else null
  end;
$$;

-- Active couple space of a user (or null).
create function private.active_space_id(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.couple_space_id
  from public.couple_members m
  join public.couple_spaces s on s.id = m.couple_space_id
  where m.user_id = p_user and m.left_at is null and s.status = 'active'
  limit 1;
$$;

-- Conversation the user may currently access (or null).
create function private.active_conversation_id(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.conversations c
  where c.couple_space_id = private.active_space_id(p_user);
$$;

-- The other active member of the user's couple space (or null).
create function private.active_partner_id(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.couple_members m
  where m.couple_space_id = private.active_space_id(p_user)
    and m.left_at is null and m.user_id <> p_user
  limit 1;
$$;

create function private.is_active_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a NULL here would make `if not is_active_member(...)` silently pass.
  select coalesce(p_conversation = private.active_conversation_id((select auth.uid())), false);
$$;

create function private.is_blocked_either_way(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Fixed-window rate limiter. Returns true when the call is allowed.
create function private.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

create function private.require_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.rate_limit_hit(p_bucket, p_limit, p_window_seconds) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
end;
$$;

create function private.audit(
  p_actor uuid, p_event text, p_target_type text default null, p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (p_actor, p_event, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Push a server-originated event to a user's private Realtime topic.
create function private.notify_user(p_user uuid, p_event text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is not null then
    perform realtime.send(coalesce(p_payload, '{}'::jsonb), p_event, 'user:' || p_user::text, true);
  end if;
end;
$$;

-- Helpers used inside RLS policies / Realtime authorisation must be executable by clients.
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.try_uuid(text) to authenticated;
grant execute on function private.active_space_id(uuid) to authenticated;
grant execute on function private.active_conversation_id(uuid) to authenticated;
grant execute on function private.active_partner_id(uuid) to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
-- private tables are never directly accessible to client roles.
revoke all on all tables in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges: start from nothing, grant the minimum.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_path) on public.profiles to authenticated;

grant select on public.user_settings to authenticated;
grant update (show_online_status, show_last_seen, discoverable_by_username, theme, notify_sound, notify_desktop)
  on public.user_settings to authenticated;

grant select on public.couple_spaces to authenticated;
grant select on public.couple_members to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.message_reads to authenticated;
grant select on public.connection_requests to authenticated;
-- token_hash is deliberately not selectable.
grant select (id, inviter_id, status, accepted_by, couple_space_id, created_at, expires_at, accepted_at, revoked_at)
  on public.invitations to authenticated;
grant select, insert, delete on public.saved_messages to authenticated;
grant select on public.blocked_users to authenticated;
grant select on public.reports to authenticated;
-- user_activity, audit_logs: no direct client access.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.user_activity       enable row level security;
alter table public.couple_spaces       enable row level security;
alter table public.couple_members      enable row level security;
alter table public.connection_requests enable row level security;
alter table public.invitations         enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.message_reads       enable row level security;
alter table public.saved_messages      enable row level security;
alter table public.blocked_users       enable row level security;
alter table public.reports             enable row level security;
alter table public.audit_logs          enable row level security;

-- profiles: yourself and your active partner. Search results and request
-- counterparts are served through SECURITY DEFINER functions returning only public card fields.
create policy profiles_select_self_or_partner on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id = private.active_partner_id((select auth.uid())));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- couple data: only the ACTIVE space of the caller. Disconnected members lose access.
create policy couple_spaces_select_active_member on public.couple_spaces
  for select to authenticated
  using (id = private.active_space_id((select auth.uid())));

create policy couple_members_select_active_member on public.couple_members
  for select to authenticated
  using (couple_space_id = private.active_space_id((select auth.uid())) and left_at is null);

create policy conversations_select_active_member on public.conversations
  for select to authenticated
  using (id = private.active_conversation_id((select auth.uid())));

create policy messages_select_active_member on public.messages
  for select to authenticated
  using (conversation_id = private.active_conversation_id((select auth.uid())));

create policy message_reads_select_active_member on public.message_reads
  for select to authenticated
  using (conversation_id = private.active_conversation_id((select auth.uid())));

create policy connection_requests_select_party on public.connection_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy invitations_select_own on public.invitations
  for select to authenticated using (inviter_id = (select auth.uid()));

create policy saved_messages_select_own on public.saved_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy saved_messages_insert_own on public.saved_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.conversation_id = private.active_conversation_id((select auth.uid()))
    )
  );
create policy saved_messages_delete_own on public.saved_messages
  for delete to authenticated using (user_id = (select auth.uid()));

create policy blocked_users_select_own on public.blocked_users
  for select to authenticated using (blocker_id = (select auth.uid()));

create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));

-- user_activity and audit_logs: RLS enabled with no policies => no client access.

-- ---------------------------------------------------------------------------
-- Realtime authorisation (private channels)
--   conversation:<id>        receive-only, events published by DB triggers
--   conversation:<id>:live   members may send (typing) and track presence
--   user:<id>                receive-only, that user only
-- ---------------------------------------------------------------------------

create policy realtime_receive_authorised_topics on realtime.messages
  for select to authenticated
  using (
    (
      realtime.topic() like 'conversation:%'
      and private.is_active_member(private.try_uuid(split_part(realtime.topic(), ':', 2)))
      and (split_part(realtime.topic(), ':', 3) = '' or split_part(realtime.topic(), ':', 3) = 'live')
    )
    or realtime.topic() = 'user:' || (select auth.uid())::text
  );

create policy realtime_send_live_topic on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and realtime.topic() like 'conversation:%:live'
    and private.is_active_member(private.try_uuid(split_part(realtime.topic(), ':', 2)))
  );
