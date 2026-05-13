-- ============================================================================
-- Codex review P1 fixes (PR #9)
--   1. rate_limit_check: make count+insert atomic per (user_id, action) via
--      transaction-scoped advisory lock so bursty concurrent calls cannot all
--      observe v_count < p_limit and slip past the quota.
--   2. cleanup_orphan_inbound_pending: skip storage objects that are still
--      referenced by a live inbound_requests row (excel_storage_path or
--      image_paths[]) so the GC never deletes attachments of valid requests.
-- ============================================================================

-- -- Fix 1: rate-limit serialization -------------------------------------------
create or replace function public.rate_limit_check(
  p_action text,
  p_limit int,
  p_window_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  -- Serialize concurrent callers with the same (user_id, action). The lock is
  -- transaction-scoped, so it releases automatically on commit/rollback.
  -- hashtextextended → bigint matches pg_advisory_xact_lock(bigint).
  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_action, 0)
  );

  select count(*) into v_count
    from public.rate_limits
   where user_id = v_uid
     and action = p_action
     and occurred_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.rate_limits (user_id, action) values (v_uid, p_action);

  -- Amortized GC: ~1% of calls clean rows older than 1 day.
  if random() < 0.01 then
    delete from public.rate_limits where occurred_at < now() - interval '1 day';
  end if;
end; $$;

revoke execute on function public.rate_limit_check(text, int, int) from public, anon;
grant  execute on function public.rate_limit_check(text, int, int) to authenticated;

-- -- Fix 2: orphan-cleanup must skip live references ---------------------------
create or replace function public.cleanup_orphan_inbound_pending(
  p_older_than interval default '24 hours'
) returns int
language plpgsql security definer set search_path = public as $$
declare v_removed int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  with d as (
    delete from storage.objects o
     where o.bucket_id = 'inbound-requests'
       and o.name like '%/_pending_%/%'
       and o.created_at < now() - p_older_than
       and not exists (
         select 1
           from public.inbound_requests r
          where r.excel_storage_path = o.name
             or o.name = any (r.image_paths)
       )
     returning 1
  )
  select count(*) into v_removed from d;

  return v_removed;
end; $$;

revoke execute on function public.cleanup_orphan_inbound_pending(interval) from public, anon;
grant  execute on function public.cleanup_orphan_inbound_pending(interval) to authenticated;
