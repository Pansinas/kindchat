-- Database security & invariant tests. Run with: npm run test:db
-- Each check raises on failure; the script runs with ON_ERROR_STOP.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, false);
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then
      raise exception 'expected error containing "%" but got "%" for: %', p_fragment, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded: %', p_fragment, p_sql;
end $$;

create or replace function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_label; end if;
  raise notice 'ok - %', p_label;
end $$;
set client_min_messages = notice;

grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'u.a@id.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'u.b@id.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'u.c@id.test'),
  ('dddddddd-0000-0000-0000-000000000004', 'u.d@id.test'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'u.e@id.test');

set role service_role;
select public.server_provision_account('aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'Alice', 'u.a@id.test');
select public.server_provision_account('bbbbbbbb-0000-0000-0000-000000000002', 'bob_92', 'Bob', 'u.b@id.test');
select public.server_provision_account('cccccccc-0000-0000-0000-000000000003', 'carol', 'Carol', 'u.c@id.test');
select public.server_provision_account('dddddddd-0000-0000-0000-000000000004', 'dave', 'Dave', 'u.d@id.test');
select public.server_provision_account('eeeeeeee-0000-0000-0000-000000000005', 'erin', 'Erin', 'u.e@id.test');
select pg_temp.expect_error($$select public.server_provision_account('eeeeeeee-0000-0000-0000-000000000005', 'ALICE', 'x', 'u.x@id.test')$$, 'USERNAME_UNAVAILABLE');
select pg_temp.check(not public.server_username_available('alice'), 'usernames are unique case-insensitively');
select pg_temp.check(not public.server_username_available('Admin'), 'reserved usernames are rejected');
select pg_temp.check(not public.server_username_available('a-b'), 'invalid characters are rejected');
select pg_temp.check((select auth_email from public.server_resolve_login('ALICE')) = 'u.a@id.test', 'login resolves username case-insensitively');
reset role;

-- ---------------------------------------------------------------- privilege boundaries
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select * from private.private_auth_mapping$$, 'permission denied');
select pg_temp.expect_error($$select * from public.server_resolve_login('alice')$$, 'permission denied');
select pg_temp.expect_error($$select public.server_rate_limit_hit('x', 1, 1)$$, 'permission denied');
select pg_temp.expect_error($$select token_hash from public.invitations$$, 'permission denied');
select pg_temp.expect_error($$select * from public.audit_logs$$, 'permission denied');
select pg_temp.expect_error($$update public.profiles set username = 'hacker' where id = auth.uid()$$, 'permission denied');
select pg_temp.check((select count(*) from public.profiles) = 1, 'unpaired user sees only their own profile');
reset role;

set role anon;
select pg_temp.expect_error($$select * from public.profiles$$, 'permission denied');
select pg_temp.expect_error($$select public.get_my_state()$$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- method A: search + request
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.search_user_by_username('BOB_92')) = 1, 'exact case-insensitive search finds a user');
select pg_temp.check((select count(*) from public.search_user_by_username('bob')) = 0, 'search is exact-match only');
select pg_temp.check((select count(*) from public.search_user_by_username('alice')) = 0, 'search never returns yourself');
select public.send_connection_request('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error($$select public.send_connection_request('bbbbbbbb-0000-0000-0000-000000000002')$$, 'REQUEST_ALREADY_SENT');
select pg_temp.expect_error($$select public.send_connection_request('aaaaaaaa-0000-0000-0000-000000000001')$$, 'SELF_CONNECTION');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error($$select public.send_connection_request('aaaaaaaa-0000-0000-0000-000000000001')$$, 'REQUEST_ALREADY_RECEIVED');
select pg_temp.check(jsonb_array_length(public.get_my_state() -> 'incoming_requests') = 1, 'recipient sees the incoming request');

-- Carol cannot answer a request addressed to Bob.
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format($$select public.respond_connection_request(%L, true)$$,
  (select id from public.connection_requests limit 1)), 'REQUEST_NOT_FOUND');
reset role;
select pg_temp.check(true, 'checkpoint');
set role authenticated;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.respond_connection_request((select id from public.connection_requests where recipient_id = auth.uid() and status = 'pending'), true);
select pg_temp.check((public.get_my_state() -> 'couple' -> 'partner' ->> 'username') = 'Alice', 'accepting creates the couple space');
select pg_temp.check((select count(*) from public.profiles) = 2, 'paired user sees own and partner profile');
reset role;

-- ---------------------------------------------------------------- invariants (enforced by constraints)
select pg_temp.expect_error($$insert into public.couple_members (couple_space_id, user_id, slot)
  select couple_space_id, 'cccccccc-0000-0000-0000-000000000003', 2 from public.couple_members limit 1$$, 'couple_members_slot_unique');
select pg_temp.expect_error($$insert into public.couple_members (couple_space_id, user_id, slot)
  select couple_space_id, 'cccccccc-0000-0000-0000-000000000003', 3 from public.couple_members limit 1$$, 'check constraint');
do $$
declare s uuid;
begin
  insert into public.couple_spaces default values returning id into s;
  begin
    insert into public.couple_members (couple_space_id, user_id, slot) values (s, 'aaaaaaaa-0000-0000-0000-000000000001', 1);
    raise exception 'one-active-couple index missing';
  exception when unique_violation then null;
  end;
  delete from public.couple_spaces where id = s;
end $$;
select pg_temp.check(true, 'a user cannot be in two active couple spaces');

-- ---------------------------------------------------------------- method B: invitations
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select * from public.create_invitation()$$, 'ALREADY_PAIRED');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
create temp table inv as select * from public.create_invitation();
grant select on inv to anon, authenticated;
select pg_temp.check((select char_length(token) from inv) = 43, 'invitation token is 256-bit base64url');
reset role;
select pg_temp.check((select token_hash <> convert_to((select token from inv), 'UTF8') from public.invitations where id = (select id from inv)), 'raw token is not stored');
set role anon;
select pg_temp.check((select inviter_username from public.preview_invitation((select token from inv))) = 'carol', 'anon can preview a valid invitation');
select pg_temp.check((select count(*) from public.preview_invitation('x' || (select token from inv))) = 0, 'unknown token previews nothing');
reset role;
set role authenticated;
select pg_temp.expect_error($$select public.accept_invitation((select token from inv))$$, 'CANNOT_ACCEPT_OWN_INVITATION');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.accept_invitation((select token from inv))$$, 'ALREADY_PAIRED');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select public.accept_invitation((select token from inv));
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select pg_temp.expect_error($$select public.accept_invitation((select token from inv))$$, 'INVITATION_INVALID');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select pg_temp.check((public.get_my_state() -> 'couple' -> 'partner' ->> 'username') = 'carol', 'invitation acceptance pairs the users');
reset role;

-- ---------------------------------------------------------------- messaging
create temp table ids as
select (select c.id from public.conversations c join public.couple_members m on m.couple_space_id = c.couple_space_id
        where m.user_id = 'aaaaaaaa-0000-0000-0000-000000000001') as ab,
       (select c.id from public.conversations c join public.couple_members m on m.couple_space_id = c.couple_space_id
        where m.user_id = 'cccccccc-0000-0000-0000-000000000003') as cd;
grant select on ids to authenticated;

set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into public.messages (conversation_id, sender_id, client_message_id, body)
  values ((select ab from ids), auth.uid(), gen_random_uuid(), 'hi')$$, 'permission denied');
select (public.send_message((select ab from ids), '  Hello Bob 👋  ', '11111111-1111-1111-1111-111111111111')).seq;
select pg_temp.check((select count(*) from public.messages) = 1, 'sender can read the message');
select pg_temp.check((select body from public.messages limit 1) = 'Hello Bob 👋', 'message body is trimmed');
select public.send_message((select ab from ids), 'Hello Bob 👋', '11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.messages) = 1, 'retry with same client_message_id is idempotent');
select pg_temp.expect_error($$select public.send_message((select ab from ids), '   ', gen_random_uuid())$$, 'MESSAGE_EMPTY');
select pg_temp.expect_error($$select public.send_message((select ab from ids), repeat('a', 5001), gen_random_uuid())$$, 'MESSAGE_TOO_LONG');
select public.send_message((select ab from ids), repeat('😀', 5000), gen_random_uuid());
select pg_temp.check(true, '5000 emoji (code points) are accepted');
select pg_temp.expect_error($$select public.send_message((select cd from ids), 'intrude', gen_random_uuid())$$, 'NOT_A_MEMBER');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.messages where conversation_id = (select ab from ids)) = 0, 'outsiders cannot read messages even with the conversation id');
select pg_temp.check((select count(*) from public.conversations where id = (select ab from ids)) = 0, 'outsiders cannot see the conversation');
select pg_temp.check((select count(*) from public.message_reads where conversation_id = (select ab from ids)) = 0, 'outsiders cannot see receipts');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check(public.get_unread_count() = 2, 'recipient has 2 unread');
select public.mark_read((select ab from ids), 999999);
select pg_temp.check((select last_read_seq from public.message_reads where user_id = auth.uid()) =
                     (select last_message_seq from public.conversations where id = (select ab from ids)), 'read cursor is clamped to the last real message');
select pg_temp.check(public.get_unread_count() = 0, 'unread count resets after reading');
select pg_temp.check((select last_read_seq from public.message_reads where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') > 0, 'sender cursor unaffected by partner');
select pg_temp.expect_error($$update public.message_reads set last_read_seq = 0 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'permission denied');
reset role;
select pg_temp.check((select count(*) from realtime.messages where event = 'message.created') = 2, 'each committed message is broadcast exactly once');
select pg_temp.check((select count(*) from realtime.messages where event = 'receipt.updated') >= 1, 'receipts are broadcast');

-- ---------------------------------------------------------------- realtime authorisation
set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select set_config('realtime.topic', 'conversation:' || (select ab from ids), false);
select pg_temp.check((select count(*) from realtime.messages where topic = realtime.topic()) > 0, 'member can receive on conversation topic');
select pg_temp.expect_error($$insert into realtime.messages (topic, extension, event, payload) values (realtime.topic(), 'broadcast', 'message.created', '{}')$$, 'row-level security');
select set_config('realtime.topic', 'conversation:' || (select ab from ids) || ':live', false);
insert into realtime.messages (topic, extension, event, payload) values (realtime.topic(), 'broadcast', 'typing', '{}');
select pg_temp.check(true, 'member can send typing on the :live topic');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select set_config('realtime.topic', 'conversation:' || (select ab from ids), false);
select pg_temp.check((select count(*) from realtime.messages where topic = realtime.topic()) = 0, 'outsider cannot receive on another couple topic');
select set_config('realtime.topic', 'conversation:' || (select ab from ids) || ':live', false);
select pg_temp.expect_error($$insert into realtime.messages (topic, extension, event, payload) values (realtime.topic(), 'broadcast', 'typing', '{}')$$, 'row-level security');
select set_config('realtime.topic', 'user:bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) from realtime.messages where topic = realtime.topic()) = 0, 'users cannot receive on another user topic');
reset role;

-- ---------------------------------------------------------------- presence privacy
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((public.get_partner_status() ->> 'last_seen_at') is not null, 'last seen visible when both share it');
update public.user_settings set show_last_seen = false where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from public.user_settings) = 1, 'settings are private to their owner');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
update public.user_settings set show_last_seen = false where user_id = auth.uid();
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((public.get_partner_status() ->> 'last_seen_at') is null, 'hidden last seen is not revealed');
select pg_temp.expect_error($$select * from public.user_activity$$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- disconnect & retention
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.disconnect_partner('carol')$$, 'CONFIRMATION_MISMATCH');
select public.disconnect_partner('BOB_92');
select pg_temp.check((select count(*) from public.messages) = 0, 'disconnected member loses message access');
select pg_temp.check(public.get_my_state() -> 'couple' = 'null'::jsonb, 'couple is gone from state');
select pg_temp.check(public.get_my_state() -> 'ended_couple' ->> 'purge_after' is not null, 'retention window is reported');
select pg_temp.expect_error($$select public.send_message((select ab from ids), 'still there?', gen_random_uuid())$$, 'NOT_A_MEMBER');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.messages) = 0, 'partner also loses access');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_config('realtime.topic', 'conversation:' || (select ab from ids) || ':live', false);
select pg_temp.expect_error($$insert into realtime.messages (topic, extension, event, payload) values (realtime.topic(), 'broadcast', 'typing', '{}')$$, 'row-level security');
reset role;

select pg_temp.check((select count(*) from public.messages where conversation_id = (select ab from ids)) = 2, 'history is retained (not silently deleted) during the window');
set role service_role;
select pg_temp.check(jsonb_array_length(public.server_export_user_data('aaaaaaaa-0000-0000-0000-000000000001') -> 'conversations') = 1, 'former member can export during the window');
reset role;
update public.couple_spaces set purge_after = now() - interval '1 minute' where status = 'ended';
select private.run_maintenance();
select pg_temp.check((select count(*) from public.messages where conversation_id = (select ab from ids)) = 0, 'history is purged after the retention window');

-- Both can pair again (with anyone).
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select count(*) from public.create_invitation();
reset role;

-- ---------------------------------------------------------------- blocking
set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select public.block_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.search_user_by_username('erin')) = 0, 'blocked users are hidden from search');
select pg_temp.expect_error($$select public.send_connection_request('eeeeeeee-0000-0000-0000-000000000005')$$, 'NOT_AVAILABLE');
reset role;

select 'ALL DATABASE TESTS PASSED' as result;
