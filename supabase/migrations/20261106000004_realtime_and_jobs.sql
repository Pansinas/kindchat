-- Realtime fan-out (Broadcast from Database) and scheduled maintenance.
-- Events are published from triggers inside the writing transaction, so a rolled-back
-- write never produces an event. Clients only RECEIVE on these topics (see 0002).

create function private.broadcast_message() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  return null;
end;
$$;

create trigger messages_broadcast
  after insert or update on public.messages
  for each row execute function private.broadcast_message();

create function private.broadcast_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_read_seq is distinct from old.last_read_seq
     or new.last_delivered_seq is distinct from old.last_delivered_seq then
    perform realtime.send(
      jsonb_build_object(
        'conversation_id', new.conversation_id, 'user_id', new.user_id,
        'last_delivered_seq', new.last_delivered_seq, 'last_read_seq', new.last_read_seq,
        'last_read_at', new.last_read_at
      ),
      'receipt.updated',
      'conversation:' || new.conversation_id::text,
      true
    );
  end if;
  return null;
end;
$$;

create trigger message_reads_broadcast
  after update on public.message_reads
  for each row execute function private.broadcast_receipt();

-- ---------------------------------------------------------------------------
-- Maintenance: expiry and the retention purge.
-- ---------------------------------------------------------------------------

create function private.run_maintenance() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.connection_requests set status = 'expired', responded_at = now()
   where status = 'pending' and expires_at <= now();
  update public.invitations set status = 'expired'
   where status = 'pending' and expires_at <= now();

  -- Retention: conversations of ended couples are purged after their window.
  delete from public.messages m
   using public.conversations c, public.couple_spaces s
   where m.conversation_id = c.id and c.couple_space_id = s.id
     and s.status = 'ended' and s.purge_after <= now();
  update public.couple_spaces set status = 'purged', purged_at = now()
   where status = 'ended' and purge_after <= now();

  delete from private.rate_limits where window_start < now() - interval '31 days';
  delete from private.email_verification_tokens where expires_at < now() - interval '7 days';
end;
$$;

-- pg_cron is available on Supabase; skip scheduling where it is not (e.g. plain Postgres in CI).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('pairvella-maintenance', '17 * * * *', 'select private.run_maintenance()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avatar storage: public-read bucket; users write only inside their own folder.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy avatars_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy avatars_update_own on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy avatars_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end;
$$;
