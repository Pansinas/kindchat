-- KindChat: founder chat + partner local time.
--
-- 1. Time zones: each user's IANA time zone is stored in user_settings (set automatically
--    by their browser) and shared only with the people they chat with.
-- 2. Founder chat: one configured account (the founder, e.g. @Pansinas) has a private
--    one-to-one "KindChat team" conversation with every user. The founder can start a chat
--    with any user; users can message only the founder (besides their partner). Every user
--    receives a greeting message from the founder. Founder chats are completely separate from
--    couple spaces: the founder never gains access to any couple conversation.

-- ---------------------------------------------------------------------------
-- Time zones
-- ---------------------------------------------------------------------------

alter table public.user_settings
  add column timezone text check (timezone is null or timezone ~ '^[A-Za-z0-9_+\-/]{1,64}$');
grant update (timezone) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- App configuration (single row): who the founder is and the greeting text.
-- ---------------------------------------------------------------------------

create table private.app_config (
  id               boolean primary key default true check (id),
  founder_user_id  uuid references public.profiles (id) on delete set null,
  greeting_message text not null default
    'Hi, I''m the founder of KindChat 👋 Welcome — I''m really glad you''re here. '
    || 'If you have a question, an idea or a problem, just reply here. I read every message.'
    check (char_length(greeting_message) between 1 and 5000)
);
insert into private.app_config default values;

create function private.founder_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select founder_user_id from private.app_config where id;
$$;

-- ---------------------------------------------------------------------------
-- Conversations become either a couple conversation or a founder conversation.
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column kind text not null default 'couple' check (kind in ('couple', 'founder')),
  add column member_user_id uuid references public.profiles (id) on delete cascade;
alter table public.conversations alter column couple_space_id drop not null;
alter table public.conversations add constraint conversations_kind_shape check (
  (kind = 'couple' and couple_space_id is not null and member_user_id is null)
  or (kind = 'founder' and couple_space_id is null and member_user_id is not null)
);
-- Exactly one founder chat per user.
create unique index conversations_one_founder_chat_per_user
  on public.conversations (member_user_id) where kind = 'founder';

-- Founder conversations the user may access: their own one, or all of them for the founder.
create function private.founder_conversation_ids(p_user uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case
    when p_user is null then '{}'::uuid[]
    when p_user = private.founder_id() then
      coalesce((select array_agg(id) from public.conversations where kind = 'founder'), '{}'::uuid[])
    else
      coalesce((select array_agg(id) from public.conversations
                where kind = 'founder' and member_user_id = p_user), '{}'::uuid[])
  end;
$$;
grant execute on function private.founder_conversation_ids(uuid) to authenticated;
grant execute on function private.founder_id() to authenticated;

-- Membership now covers the active couple conversation AND accessible founder conversations.
-- send_message, mark_read/mark_delivered and Realtime topic authorisation all use this.
create or replace function private.is_active_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_conversation = private.active_conversation_id((select auth.uid())), false)
      or coalesce(p_conversation = any (private.founder_conversation_ids((select auth.uid()))), false);
$$;

drop policy conversations_select_active_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated
  using (
    id = private.active_conversation_id((select auth.uid()))
    or id = any (private.founder_conversation_ids((select auth.uid())))
  );

drop policy messages_select_active_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    conversation_id = private.active_conversation_id((select auth.uid()))
    or conversation_id = any (private.founder_conversation_ids((select auth.uid())))
  );

drop policy message_reads_select_active_member on public.message_reads;
create policy message_reads_select_member on public.message_reads
  for select to authenticated
  using (
    conversation_id = private.active_conversation_id((select auth.uid()))
    or conversation_id = any (private.founder_conversation_ids((select auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- Founder conversation management
-- ---------------------------------------------------------------------------

-- Creates the founder chat for a user if missing; optionally posts the greeting.
create function private.ensure_founder_conversation(p_user uuid, p_greet boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_founder uuid := private.founder_id();
  v_conv    uuid;
  v_msg     public.messages;
begin
  if v_founder is null or p_user is null or p_user = v_founder then
    return null;
  end if;
  select id into v_conv from public.conversations where kind = 'founder' and member_user_id = p_user;
  if v_conv is null then
    insert into public.conversations (kind, member_user_id) values ('founder', p_user)
    on conflict do nothing
    returning id into v_conv;
    if v_conv is null then
      select id into v_conv from public.conversations where kind = 'founder' and member_user_id = p_user;
    end if;
  end if;
  insert into public.message_reads (conversation_id, user_id)
  values (v_conv, p_user), (v_conv, v_founder)
  on conflict do nothing;

  if p_greet and not exists (select 1 from public.messages where conversation_id = v_conv) then
    insert into public.messages (conversation_id, sender_id, client_message_id, body)
    values (v_conv, v_founder, gen_random_uuid(), (select greeting_message from private.app_config where id))
    returning * into v_msg;
    update public.conversations set last_message_seq = v_msg.seq, last_message_at = v_msg.created_at where id = v_conv;
    update public.message_reads
       set last_delivered_seq = v_msg.seq, last_read_seq = v_msg.seq, last_read_at = now(), last_delivered_at = now()
     where conversation_id = v_conv and user_id = v_founder;
  end if;
  return v_conv;
end;
$$;

-- Run once by the project owner (SQL editor): makes an account the founder and greets everyone.
--   select private.set_founder('Pansinas');
create function private.set_founder(p_username text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_founder uuid;
  v_count   integer := 0;
  r         record;
begin
  select id into v_founder from public.profiles where lower(username) = lower(p_username);
  if v_founder is null then
    raise exception 'No account with username %', p_username;
  end if;
  update private.app_config set founder_user_id = v_founder where id;
  -- Existing founder chats (e.g. after changing founder) get receipt rows for the new founder.
  insert into public.message_reads (conversation_id, user_id)
  select id, v_founder from public.conversations where kind = 'founder'
  on conflict do nothing;
  for r in select id from public.profiles where id <> v_founder loop
    perform private.ensure_founder_conversation(r.id, true);
    v_count := v_count + 1;
  end loop;
  perform private.audit(v_founder, 'admin.founder_set', 'profile', v_founder);
  return v_count;
end;
$$;

-- New accounts are greeted automatically.
create or replace function public.server_provision_account(
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
  perform private.ensure_founder_conversation(p_user_id, true);
  perform private.audit(p_user_id, 'account.created', 'profile', p_user_id);
exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

-- Founder only: open (or create) a chat with any user by username.
create function public.founder_start_conversation(p_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_uid();
  v_user uuid;
begin
  if v_uid is distinct from private.founder_id() then
    raise exception 'FORBIDDEN';
  end if;
  select id into v_user from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''), '@ '));
  if v_user is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_user = v_uid then
    raise exception 'INVALID_TARGET';
  end if;
  return private.ensure_founder_conversation(v_user, false);
end;
$$;

-- Founder only: inbox of all founder chats, newest activity first.
create function public.founder_list_conversations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_uid();
begin
  if v_uid is distinct from private.founder_id() then
    raise exception 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(row order by sort_at desc nulls last)
    from (
      select
        jsonb_build_object(
          'conversation_id', c.id,
          'user', private.profile_card(c.member_user_id)
                  || jsonb_build_object('timezone', (select s.timezone from public.user_settings s where s.user_id = c.member_user_id)),
          'last_message_at', c.last_message_at,
          'last_message', (select jsonb_build_object('body', left(m.body, 120), 'from_founder', m.sender_id = v_uid)
                           from public.messages m where m.conversation_id = c.id and m.deleted_at is null
                           order by m.seq desc limit 1),
          'unread', (select count(*) from public.messages m
                     where m.conversation_id = c.id and m.sender_id = c.member_user_id and m.deleted_at is null
                       and m.seq > coalesce((select r.last_read_seq from public.message_reads r
                                             where r.conversation_id = c.id and r.user_id = v_uid), 0))
        ) as row,
        coalesce(c.last_message_at, c.created_at) as sort_at
      from public.conversations c
      where c.kind = 'founder'
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- State: founder chat for users, inbox counter for the founder, time zones.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_uid();
  v_space   uuid := private.active_space_id(v_uid);
  v_partner uuid := private.active_partner_id(v_uid);
  v_founder uuid := private.founder_id();
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
      order by cs.ended_at desc limit 1),
    'is_founder', v_founder is not null and v_founder = v_uid,
    'founder_chat', (
      select jsonb_build_object(
        'conversation_id', c.id,
        'founder', private.profile_card(v_founder)
                   || jsonb_build_object('timezone', (select s.timezone from public.user_settings s where s.user_id = v_founder)),
        'unread', (select count(*) from public.messages m
                   where m.conversation_id = c.id and m.sender_id = v_founder and m.deleted_at is null
                     and m.seq > coalesce((select r.last_read_seq from public.message_reads r
                                           where r.conversation_id = c.id and r.user_id = v_uid), 0)))
      from public.conversations c
      where c.kind = 'founder' and c.member_user_id = v_uid and v_founder is not null),
    'founder_inbox_unread', case when v_founder is not null and v_founder = v_uid then (
      select count(*) from public.conversations c
      join public.messages m on m.conversation_id = c.id and m.sender_id = c.member_user_id and m.deleted_at is null
      left join public.message_reads r on r.conversation_id = c.id and r.user_id = v_uid
      where c.kind = 'founder' and m.seq > coalesce(r.last_read_seq, 0)) else 0 end
  ) into v_result;
  return v_result;
end;
$$;

-- Partner status now includes the partner's time zone (for the "their local time" display).
create or replace function public.get_partner_status() returns jsonb
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
    'last_seen_visible', v_mine.show_last_seen and v_theirs.show_last_seen,
    'timezone', v_theirs.timezone
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: tell the other side of a founder chat that a message arrived (inbox / badge).
-- ---------------------------------------------------------------------------

create or replace function private.broadcast_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'seq', new.seq, 'conversation_id', new.conversation_id,
      'sender_id', new.sender_id, 'client_message_id', new.client_message_id,
      'kind', new.kind, 'body', new.body, 'created_at', new.created_at,
      'edited_at', new.edited_at, 'deleted_at', new.deleted_at
    ),
    case when tg_op = 'INSERT' then 'message.created' else 'message.updated' end,
    'conversation:' || new.conversation_id::text,
    true
  );
  if tg_op = 'INSERT' then
    select * into v_conv from public.conversations where id = new.conversation_id;
    if v_conv.kind = 'founder' then
      perform private.notify_user(
        case when new.sender_id = v_conv.member_user_id then private.founder_id() else v_conv.member_user_id end,
        'founder.message',
        jsonb_build_object('conversation_id', new.conversation_id)
      );
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Export includes the user's founder chat.
-- ---------------------------------------------------------------------------

create or replace function public.server_export_user_data(p_user_id uuid) returns jsonb
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
             or cs.status = 'ended' and cs.purge_after > now())), '[]'::jsonb),
    'kindchat_team_chat', (
      select jsonb_build_object(
        'conversation_id', c.id,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', msg.id, 'from_kindchat_team', msg.sender_id is distinct from p_user_id, 'body', msg.body,
            'created_at', msg.created_at) order by msg.seq)
          from public.messages msg where msg.conversation_id = c.id), '[]'::jsonb))
      from public.conversations c where c.kind = 'founder' and c.member_user_id = p_user_id)
  );
$$;

-- Privileges (re-asserted for replaced functions; new client-callable functions).
revoke execute on function public.founder_start_conversation(text) from public, anon;
revoke execute on function public.founder_list_conversations() from public, anon;
grant execute on function public.founder_start_conversation(text) to authenticated;
grant execute on function public.founder_list_conversations() to authenticated;
revoke execute on function public.server_provision_account(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.server_export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.server_provision_account(uuid, text, text, text) to service_role;
grant execute on function public.server_export_user_data(uuid) to service_role;
revoke all on function private.set_founder(text) from public, anon, authenticated;
revoke all on function private.ensure_founder_conversation(uuid, boolean) from public, anon, authenticated;
