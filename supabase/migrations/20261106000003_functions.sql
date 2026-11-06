-- Domain operations (RPC). Every function:
--   * derives the caller from auth.uid() - never from a parameter;
--   * is SECURITY DEFINER with an empty search_path and schema-qualified names;
--   * raises stable, machine-readable error codes (message text) that the client maps to copy.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create function private.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return v;
end;
$$;

create function private.profile_card(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_path', p.avatar_path
  )
  from public.profiles p where p.id = p_user;
$$;

create function private.hash_token(p_token text) returns bytea
language sql immutable set search_path = '' as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

-- The single place where a couple space is created. Both callers have already
-- established consent; this function re-validates every invariant under locks.
create function private.create_couple_space(a uuid, b uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_space uuid;
  v_conv  uuid;
begin
  if a is null or b is null or a = b then
    raise exception 'SELF_CONNECTION';
  end if;

  -- Serialise concurrent pairings involving either user (deterministic lock order).
  perform 1 from public.profiles where id in (a, b) order by id for update;
  if (select count(*) from public.profiles where id in (a, b)) <> 2 then
    raise exception 'NOT_AVAILABLE';
  end if;

  if private.is_blocked_either_way(a, b) then
    raise exception 'NOT_AVAILABLE';
  end if;
  if private.active_space_id(a) is not null or private.active_space_id(b) is not null then
    raise exception 'ALREADY_PAIRED';
  end if;

  insert into public.couple_spaces default values returning id into v_space;
  insert into public.couple_members (couple_space_id, user_id, slot) values (v_space, a, 1), (v_space, b, 2);
  insert into public.conversations (couple_space_id) values (v_space) returning id into v_conv;
  insert into public.message_reads (conversation_id, user_id) values (v_conv, a), (v_conv, b);

  -- Close every other open pairing path for both users.
  update public.connection_requests
     set status = 'superseded', responded_at = now()
   where status = 'pending'
     and (requester_id in (a, b) or recipient_id in (a, b));
  update public.invitations
     set status = 'superseded'
   where status = 'pending' and inviter_id in (a, b);

  perform private.audit(a, 'pairing.created', 'couple_space', v_space, jsonb_build_object('partner', b));
  perform private.notify_user(a, 'pairing.created', jsonb_build_object('conversation_id', v_conv));
  perform private.notify_user(b, 'pairing.created', jsonb_build_object('conversation_id', v_conv));

  return jsonb_build_object('couple_space_id', v_space, 'conversation_id', v_conv);
exception
  when unique_violation then
    -- Safety net: the partial unique index on active membership lost a race.
    raise exception 'ALREADY_PAIRED';
end;
$$;

-- An active space must have exactly two active members at commit time.
create function private.check_couple_space_members() returns trigger
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  if exists (select 1 from public.couple_spaces where id = new.id and status = 'active') then
    select count(*) into v_count from public.couple_members
     where couple_space_id = new.id and left_at is null;
    if v_count <> 2 then
      raise exception 'Active couple space % must have exactly 2 members (has %)', new.id, v_count;
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger couple_spaces_must_have_two_members
  after insert or update on public.couple_spaces
  deferrable initially deferred
  for each row execute function private.check_couple_space_members();

-- ---------------------------------------------------------------------------
-- Session state
-- ---------------------------------------------------------------------------

-- Everything the app shell needs in one round trip.
create function public.get_my_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_uid();
  v_space   uuid := private.active_space_id(v_uid);
  v_partner uuid := private.active_partner_id(v_uid);
  v_result  jsonb;
begin
  select jsonb_build_object(
    'profile', (select jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'avatar_path', p.avatar_path, 'bio', p.bio, 'created_at', p.created_at)
      from public.profiles p where p.id = v_uid),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = v_uid),
    'couple', case when v_space is null then null else (
      select jsonb_build_object(
        'couple_space_id', cs.id,
        'conversation_id', c.id,
        'paired_since', cs.created_at,
        'partner', (select jsonb_build_object(
            'id', p.id, 'username', p.username, 'display_name', p.display_name,
            'avatar_path', p.avatar_path, 'bio', p.bio)
          from public.profiles p where p.id = v_partner))
      from public.couple_spaces cs join public.conversations c on c.couple_space_id = cs.id
      where cs.id = v_space) end,
    'incoming_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at,
                                          'user', private.profile_card(r.requester_id))
                       order by r.created_at desc)
      from public.connection_requests r
      where r.recipient_id = v_uid and r.status = 'pending' and r.expires_at > now()
        and not private.is_blocked_either_way(v_uid, r.requester_id)), '[]'::jsonb),
    'outgoing_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at,
                                          'user', private.profile_card(r.recipient_id))
                       order by r.created_at desc)
      from public.connection_requests r
      where r.requester_id = v_uid and r.status = 'pending' and r.expires_at > now()), '[]'::jsonb),
    'invitation', (
      select jsonb_build_object('id', i.id, 'created_at', i.created_at, 'expires_at', i.expires_at)
      from public.invitations i
      where i.inviter_id = v_uid and i.status = 'pending' and i.expires_at > now()),
    'ended_couple', (
      select jsonb_build_object('couple_space_id', cs.id, 'ended_at', cs.ended_at,
                                'purge_after', cs.purge_after, 'end_reason', cs.end_reason)
      from public.couple_members m join public.couple_spaces cs on cs.id = m.couple_space_id
      where m.user_id = v_uid and cs.status = 'ended' and cs.purge_after > now()
      order by cs.ended_at desc limit 1)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Partner discovery & connection requests
-- ---------------------------------------------------------------------------

create function public.search_user_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_path text, relation text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := private.require_uid();
begin
  perform private.require_rate_limit('search:' || v_uid, 30, 60);
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    return;
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_path,
      case
        when exists (select 1 from public.connection_requests r where r.status = 'pending'
                     and r.requester_id = v_uid and r.recipient_id = p.id) then 'outgoing_pending'
        when exists (select 1 from public.connection_requests r where r.status = 'pending'
                     and r.requester_id = p.id and r.recipient_id = v_uid) then 'incoming_pending'
        else 'none'
      end
    from public.profiles p
    join public.user_settings s on s.user_id = p.id
    where lower(p.username) = lower(p_username)
      and p.id <> v_uid
      and s.discoverable_by_username
      and not private.is_blocked_either_way(v_uid, p.id);
end;
$$;

create function public.send_connection_request(p_recipient uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id  uuid;
begin
  perform private.require_rate_limit('conn_req:' || v_uid, 10, 86400);
  if p_recipient is null or p_recipient = v_uid then
    raise exception 'SELF_CONNECTION';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient)
     or private.is_blocked_either_way(v_uid, p_recipient) then
    raise exception 'NOT_AVAILABLE';
  end if;
  if private.active_space_id(v_uid) is not null then
    raise exception 'ALREADY_PAIRED';
  end if;
  if exists (select 1 from public.connection_requests where status = 'pending'
             and requester_id = p_recipient and recipient_id = v_uid) then
    raise exception 'REQUEST_ALREADY_RECEIVED';
  end if;
  if exists (select 1 from public.connection_requests where status = 'pending'
             and requester_id = v_uid and recipient_id = p_recipient) then
    raise exception 'REQUEST_ALREADY_SENT';
  end if;
  if (select count(*) from public.connection_requests
      where requester_id = v_uid and status = 'pending') >= 3 then
    raise exception 'TOO_MANY_PENDING_REQUESTS';
  end if;

  -- Note: if the recipient already has a partner the request is still stored, so a
  -- stranger cannot learn someone's relationship status. It will expire quietly.
  insert into public.connection_requests (requester_id, recipient_id)
  values (v_uid, p_recipient) returning id into v_id;

  perform private.audit(v_uid, 'pairing.request_sent', 'connection_request', v_id);
  perform private.notify_user(p_recipient, 'request.received', jsonb_build_object('id', v_id));
  return v_id;
exception
  when unique_violation then
    raise exception 'REQUEST_ALREADY_SENT';
end;
$$;

create function public.respond_connection_request(p_request_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_req public.connection_requests%rowtype;
  v_result jsonb;
begin
  select * into v_req from public.connection_requests
   where id = p_request_id and recipient_id = v_uid
   for update;
  if not found or v_req.status <> 'pending' or v_req.expires_at <= now() then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if p_accept then
    v_result := private.create_couple_space(v_req.requester_id, v_uid);
    update public.connection_requests
       set status = 'accepted', responded_at = now(),
           couple_space_id = (v_result ->> 'couple_space_id')::uuid
     where id = v_req.id;
    return v_result;
  else
    update public.connection_requests set status = 'declined', responded_at = now() where id = v_req.id;
    perform private.audit(v_uid, 'pairing.request_declined', 'connection_request', v_req.id);
    perform private.notify_user(v_req.requester_id, 'request.updated', jsonb_build_object('id', v_req.id));
    return jsonb_build_object('declined', true);
  end if;
end;
$$;

create function public.cancel_connection_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_recipient uuid;
begin
  update public.connection_requests
     set status = 'cancelled', responded_at = now()
   where id = p_request_id and requester_id = v_uid and status = 'pending'
  returning recipient_id into v_recipient;
  if v_recipient is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  perform private.notify_user(v_recipient, 'request.updated', jsonb_build_object('id', p_request_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create function public.create_invitation()
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid   uuid := private.require_uid();
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  perform private.require_rate_limit('invite:' || v_uid, 10, 86400);
  if private.active_space_id(v_uid) is not null then
    raise exception 'ALREADY_PAIRED';
  end if;

  update public.invitations set status = 'superseded'
   where inviter_id = v_uid and status = 'pending';

  -- 256-bit token, base64url without padding. Only its SHA-256 is stored.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.invitations (inviter_id, token_hash)
  values (v_uid, private.hash_token(v_token))
  returning invitations.id, invitations.expires_at into v_id, v_exp;

  perform private.audit(v_uid, 'pairing.invitation_created', 'invitation', v_id);
  return query select v_id, v_token, v_exp;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  update public.invitations set status = 'revoked', revoked_at = now()
   where id = p_invitation_id and inviter_id = v_uid and status = 'pending';
  if not found then
    raise exception 'INVITATION_INVALID';
  end if;
end;
$$;

-- Public preview (also for signed-out visitors). Reveals only the inviter's card and
-- never distinguishes unknown / expired / revoked / used tokens.
create function public.preview_invitation(p_token text)
returns table (inviter_username text, inviter_display_name text, inviter_avatar_path text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.username, p.display_name, p.avatar_path, i.expires_at
  from public.invitations i
  join public.profiles p on p.id = i.inviter_id
  where p_token is not null
    and char_length(p_token) between 20 and 100
    and i.token_hash = private.hash_token(p_token)
    and i.status = 'pending'
    and i.expires_at > now();
$$;

create function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_inv public.invitations%rowtype;
  v_result jsonb;
begin
  perform private.require_rate_limit('invite_accept:' || v_uid, 20, 3600);
  if p_token is null or char_length(p_token) not between 20 and 100 then
    raise exception 'INVITATION_INVALID';
  end if;

  select * into v_inv from public.invitations
   where token_hash = private.hash_token(p_token)
   for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_inv.inviter_id = v_uid then
    raise exception 'CANNOT_ACCEPT_OWN_INVITATION';
  end if;

  v_result := private.create_couple_space(v_inv.inviter_id, v_uid);
  update public.invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now(),
         couple_space_id = (v_result ->> 'couple_space_id')::uuid
   where id = v_inv.id;
  perform private.audit(v_uid, 'pairing.invitation_accepted', 'invitation', v_inv.id);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disconnect
-- Retention policy: access ends immediately for both members; the history is frozen
-- for 30 days (exportable by either former member), then purged by a scheduled job.
-- ---------------------------------------------------------------------------

create function private.end_couple_space(p_space uuid, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.couple_spaces
     set status = 'ended', ended_at = now(), ended_by = p_actor, end_reason = p_reason,
         purge_after = now() + interval '30 days'
   where id = p_space and status = 'active';
  if not found then
    return;
  end if;
  for r in update public.couple_members set left_at = now()
            where couple_space_id = p_space and left_at is null
           returning user_id
  loop
    perform private.notify_user(r.user_id, 'pairing.ended', jsonb_build_object('couple_space_id', p_space));
  end loop;
  perform private.audit(p_actor, 'pairing.ended', 'couple_space', p_space, jsonb_build_object('reason', p_reason));
end;
$$;

create function public.disconnect_partner(p_confirm_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_space uuid := private.active_space_id(v_uid);
  v_partner uuid := private.active_partner_id(v_uid);
begin
  if v_space is null then
    raise exception 'NOT_PAIRED';
  end if;
  if not exists (select 1 from public.profiles
                 where id = v_partner and lower(username) = lower(coalesce(p_confirm_username, ''))) then
    raise exception 'CONFIRMATION_MISMATCH';
  end if;
  perform private.end_couple_space(v_space, v_uid, 'disconnect');
end;
$$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create function public.send_message(p_conversation_id uuid, p_body text, p_client_message_id uuid)
returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_uid();
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_msg  public.messages;
begin
  if not private.is_active_member(p_conversation_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if p_client_message_id is null then
    raise exception 'INVALID_MESSAGE';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- Idempotent retry: return the already-committed row.
  select * into v_msg from public.messages
   where conversation_id = p_conversation_id and client_message_id = p_client_message_id;
  if found then
    if v_msg.sender_id is distinct from v_uid then
      raise exception 'INVALID_MESSAGE';
    end if;
    return v_msg;
  end if;

  perform private.require_rate_limit('msg:10s:' || v_uid, 20, 10);
  perform private.require_rate_limit('msg:day:' || v_uid, 3000, 86400);

  -- Serialise inserts per conversation so seq order == commit order.
  perform 1 from public.conversations where id = p_conversation_id for update;

  insert into public.messages (conversation_id, sender_id, client_message_id, body)
  values (p_conversation_id, v_uid, p_client_message_id, v_body)
  returning * into v_msg;

  update public.conversations
     set last_message_seq = v_msg.seq, last_message_at = v_msg.created_at
   where id = p_conversation_id;

  -- Sending implies the sender has read everything up to their own message.
  update public.message_reads
     set last_delivered_seq = greatest(last_delivered_seq, v_msg.seq),
         last_read_seq = greatest(last_read_seq, v_msg.seq),
         last_delivered_at = now(), last_read_at = now()
   where conversation_id = p_conversation_id and user_id = v_uid;

  return v_msg;
end;
$$;

create function private.advance_receipt(p_conversation_id uuid, p_seq bigint, p_read boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_max bigint;
  v_seq bigint;
begin
  if not private.is_active_member(p_conversation_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  select last_message_seq into v_max from public.conversations where id = p_conversation_id;
  v_seq := least(coalesce(p_seq, 0), coalesce(v_max, 0));
  if v_seq <= 0 then
    return;
  end if;
  if p_read then
    update public.message_reads
       set last_read_seq = v_seq, last_read_at = now(),
           last_delivered_seq = greatest(last_delivered_seq, v_seq),
           last_delivered_at = case when last_delivered_seq < v_seq then now() else last_delivered_at end
     where conversation_id = p_conversation_id and user_id = v_uid and last_read_seq < v_seq;
  else
    update public.message_reads
       set last_delivered_seq = v_seq, last_delivered_at = now()
     where conversation_id = p_conversation_id and user_id = v_uid and last_delivered_seq < v_seq;
  end if;
end;
$$;

create function public.mark_delivered(p_conversation_id uuid, p_seq bigint) returns void
language sql security definer set search_path = '' as $$
  select private.advance_receipt(p_conversation_id, p_seq, false);
$$;

create function public.mark_read(p_conversation_id uuid, p_seq bigint) returns void
language sql security definer set search_path = '' as $$
  select private.advance_receipt(p_conversation_id, p_seq, true);
$$;

create function public.get_unread_count() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select count(*)::integer
    from public.messages m
    join public.message_reads r on r.conversation_id = m.conversation_id and r.user_id = auth.uid()
    where m.conversation_id = private.active_conversation_id(auth.uid())
      and m.sender_id is distinct from auth.uid()
      and m.deleted_at is null
      and m.seq > r.last_read_seq
  ), 0);
$$;

-- ---------------------------------------------------------------------------
-- Presence: last seen (online status uses Realtime Presence on the client).
-- ---------------------------------------------------------------------------

create function public.touch_last_seen() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  insert into public.user_activity (user_id, last_seen_at) values (v_uid, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  where public.user_activity.last_seen_at < now() - interval '30 seconds';
end;
$$;

-- Reciprocal visibility: you see your partner's last seen only if both of you share it.
create function public.get_partner_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_partner uuid := private.active_partner_id(v_uid);
  v_mine public.user_settings;
  v_theirs public.user_settings;
begin
  if v_partner is null then
    return null;
  end if;
  select * into v_mine from public.user_settings where user_id = v_uid;
  select * into v_theirs from public.user_settings where user_id = v_partner;
  return jsonb_build_object(
    'partner_id', v_partner,
    'last_seen_at', case when v_mine.show_last_seen and v_theirs.show_last_seen
                         then (select last_seen_at from public.user_activity where user_id = v_partner)
                         else null end,
    'last_seen_visible', v_mine.show_last_seen and v_theirs.show_last_seen
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile & safety
-- ---------------------------------------------------------------------------

create function public.change_username(p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'USERNAME_INVALID';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and username = p_username) then
    return;
  end if;
  if exists (select 1 from private.reserved_usernames where username_lower = lower(p_username))
     or exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> v_uid) then
    raise exception 'USERNAME_UNAVAILABLE';
  end if;
  perform private.require_rate_limit('username_change:' || v_uid, 3, 2592000);
  update public.profiles set username = p_username where id = v_uid;
  perform private.audit(v_uid, 'account.username_changed', 'profile', v_uid);
exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  if p_user is null or p_user = v_uid then
    raise exception 'INVALID_TARGET';
  end if;
  insert into public.blocked_users (blocker_id, blocked_id) values (v_uid, p_user)
  on conflict do nothing;
  update public.connection_requests set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((requester_id = v_uid and recipient_id = p_user) or (requester_id = p_user and recipient_id = v_uid));
  perform private.audit(v_uid, 'safety.user_blocked', 'profile', p_user);
end;
$$;

create function public.unblock_user(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.blocked_users where blocker_id = auth.uid() and blocked_id = p_user;
$$;

create function public.report_user(p_user uuid, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  perform private.require_rate_limit('report:' || v_uid, 5, 86400);
  if p_user is null or p_user = v_uid then
    raise exception 'INVALID_TARGET';
  end if;
  insert into public.reports (reporter_id, reported_user_id, reason, details)
  values (v_uid, p_user, p_reason, nullif(btrim(p_details), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-only functions (service role). Used by Next.js route handlers for flows
-- that need the private identity mapping. Never executable by client roles.
-- ---------------------------------------------------------------------------

create function public.server_rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language sql security definer set search_path = '' as $$
  select private.rate_limit_hit(p_bucket, p_limit, p_window_seconds);
$$;

create function public.server_audit(
  p_actor uuid, p_event text, p_ip_hash text default null, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, event_type, ip_hash, metadata)
  values (p_actor, p_event, p_ip_hash, coalesce(p_metadata, '{}'::jsonb));
$$;

create function public.server_username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from private.reserved_usernames where username_lower = lower(p_username))
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

create function public.server_provision_account(
  p_user_id uuid, p_username text, p_display_name text, p_auth_email text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_username_available(p_username) then
    raise exception 'USERNAME_UNAVAILABLE';
  end if;
  insert into public.profiles (id, username, display_name) values (p_user_id, p_username, btrim(p_display_name));
  insert into public.user_settings (user_id) values (p_user_id);
  insert into public.user_activity (user_id) values (p_user_id);
  insert into private.private_auth_mapping (user_id, auth_email) values (p_user_id, p_auth_email);
  perform private.audit(p_user_id, 'account.created', 'profile', p_user_id);
exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

-- Returns the opaque auth identity for a username (or null).
create function public.server_resolve_login(p_username text)
returns table (user_id uuid, auth_email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.auth_email
  from public.profiles p join private.private_auth_mapping m on m.user_id = p.id
  where lower(p.username) = lower(p_username);
$$;

create function public.server_get_account_private(p_user_id uuid)
returns table (auth_email text, recovery_email text, recovery_email_verified boolean)
language sql stable security definer set search_path = '' as $$
  select m.auth_email, m.recovery_email::text, m.recovery_email_verified_at is not null
  from private.private_auth_mapping m where m.user_id = p_user_id;
$$;

create function public.server_get_recovery_target(p_username text)
returns table (user_id uuid, auth_email text, recovery_email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.auth_email, m.recovery_email::text
  from public.profiles p join private.private_auth_mapping m on m.user_id = p.id
  where lower(p.username) = lower(p_username)
    and m.recovery_email is not null and m.recovery_email_verified_at is not null;
$$;

create function public.server_start_recovery_email_verification(
  p_user_id uuid, p_email text, p_token_hash bytea
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.email_verification_tokens set used_at = now()
   where user_id = p_user_id and used_at is null;
  insert into private.email_verification_tokens (user_id, email, token_hash, expires_at)
  values (p_user_id, p_email, p_token_hash, now() + interval '24 hours');
end;
$$;

create function public.server_confirm_recovery_email(p_token_hash bytea) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_tok private.email_verification_tokens;
begin
  select * into v_tok from private.email_verification_tokens
   where token_hash = p_token_hash for update;
  if not found or v_tok.used_at is not null or v_tok.expires_at <= now() then
    return null;
  end if;
  update private.email_verification_tokens set used_at = now() where id = v_tok.id;
  update private.private_auth_mapping
     set recovery_email = v_tok.email, recovery_email_verified_at = now()
   where user_id = v_tok.user_id;
  perform private.audit(v_tok.user_id, 'account.recovery_email_verified', 'profile', v_tok.user_id);
  return v_tok.user_id;
end;
$$;

create function public.server_remove_recovery_email(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  update private.private_auth_mapping set recovery_email = null, recovery_email_verified_at = null
   where user_id = p_user_id;
  update private.email_verification_tokens set used_at = now() where user_id = p_user_id and used_at is null;
$$;

-- Ends any active couple before the auth user (and, by cascade, the profile) is deleted.
create function public.server_prepare_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_space uuid := private.active_space_id(p_user_id);
begin
  if v_space is not null then
    perform private.end_couple_space(v_space, p_user_id, 'account_deleted');
  end if;
  update public.connection_requests set status = 'cancelled', responded_at = now()
   where status = 'pending' and (requester_id = p_user_id or recipient_id = p_user_id);
  update public.invitations set status = 'revoked', revoked_at = now()
   where status = 'pending' and inviter_id = p_user_id;
  perform private.audit(p_user_id, 'account.deleted', 'profile', p_user_id);
end;
$$;

-- Personal data export: own profile/settings plus conversations the user can still
-- access (active) or is entitled to export (ended, within the retention window).
create function public.server_export_user_data(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'settings', (select to_jsonb(s) from public.user_settings s where s.user_id = p_user_id),
    'recovery_email', (select m.recovery_email from private.private_auth_mapping m where m.user_id = p_user_id),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conversation_id', c.id,
        'couple_status', cs.status,
        'paired_at', cs.created_at,
        'ended_at', cs.ended_at,
        'members', (select jsonb_agg(jsonb_build_object('user_id', pm.user_id, 'username', pp.username,
                                                        'display_name', pp.display_name))
                    from public.couple_members pm left join public.profiles pp on pp.id = pm.user_id
                    where pm.couple_space_id = cs.id),
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', msg.id, 'sender_id', msg.sender_id, 'body', msg.body,
            'created_at', msg.created_at, 'edited_at', msg.edited_at, 'deleted_at', msg.deleted_at)
            order by msg.seq)
          from public.messages msg where msg.conversation_id = c.id), '[]'::jsonb)))
      from public.couple_members m
      join public.couple_spaces cs on cs.id = m.couple_space_id
      join public.conversations c on c.couple_space_id = cs.id
      where m.user_id = p_user_id
        and (cs.status = 'active' and m.left_at is null
             or cs.status = 'ended' and cs.purge_after > now())), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_my_state() to authenticated;
grant execute on function public.search_user_by_username(text) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_connection_request(uuid) to authenticated;
grant execute on function public.create_invitation() to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.preview_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.disconnect_partner(text) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.mark_delivered(uuid, bigint) to authenticated;
grant execute on function public.mark_read(uuid, bigint) to authenticated;
grant execute on function public.get_unread_count() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.get_partner_status() to authenticated;
grant execute on function public.change_username(text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_user(uuid, text, text) to authenticated;

grant execute on function public.server_rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.server_audit(uuid, text, text, jsonb) to service_role;
grant execute on function public.server_username_available(text) to service_role;
grant execute on function public.server_provision_account(uuid, text, text, text) to service_role;
grant execute on function public.server_resolve_login(text) to service_role;
grant execute on function public.server_get_account_private(uuid) to service_role;
grant execute on function public.server_get_recovery_target(text) to service_role;
grant execute on function public.server_start_recovery_email_verification(uuid, text, bytea) to service_role;
grant execute on function public.server_confirm_recovery_email(bytea) to service_role;
grant execute on function public.server_remove_recovery_email(uuid) to service_role;
grant execute on function public.server_prepare_account_deletion(uuid) to service_role;
grant execute on function public.server_export_user_data(uuid) to service_role;

-- Do not let future functions in public become callable by clients by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
