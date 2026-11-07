-- Reply to a specific message. A reply may only point at a message in the same conversation.

alter table public.messages
  add column reply_to_id uuid references public.messages (id) on delete set null;
create index messages_reply_to on public.messages (reply_to_id) where reply_to_id is not null;

-- send_message gains an optional p_reply_to (older clients that omit it keep working).
drop function public.send_message(uuid, text, uuid);

create function public.send_message(
  p_conversation_id uuid, p_body text, p_client_message_id uuid, p_reply_to uuid default null
)
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
  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation_id
  ) then
    raise exception 'INVALID_REPLY';
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

  insert into public.messages (conversation_id, sender_id, client_message_id, body, reply_to_id)
  values (p_conversation_id, v_uid, p_client_message_id, v_body, p_reply_to)
  returning * into v_msg;

  update public.conversations
     set last_message_seq = v_msg.seq, last_message_at = v_msg.created_at
   where id = p_conversation_id;

  update public.message_reads
     set last_delivered_seq = greatest(last_delivered_seq, v_msg.seq),
         last_read_seq = greatest(last_read_seq, v_msg.seq),
         last_delivered_at = now(), last_read_at = now()
   where conversation_id = p_conversation_id and user_id = v_uid;

  return v_msg;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid) to authenticated;

-- Realtime payload now carries reply_to_id.
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
      'edited_at', new.edited_at, 'deleted_at', new.deleted_at, 'reply_to_id', new.reply_to_id
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
