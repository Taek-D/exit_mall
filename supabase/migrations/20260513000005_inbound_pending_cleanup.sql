-- ============================================================================
-- Inbound orphan _pending_* storage cleanup.
-- Admin-only RPC; no schedule (call manually or via Edge Function later).
-- ============================================================================

create or replace function public.cleanup_orphan_inbound_pending(p_older_than interval default '24 hours')
returns int
language plpgsql security definer set search_path = public as $$
declare v_removed int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  with d as (
    delete from storage.objects
     where bucket_id = 'inbound-requests'
       and name like '%/_pending_%/%'
       and created_at < now() - p_older_than
     returning 1
  )
  select count(*) into v_removed from d;

  return v_removed;
end; $$;

revoke execute on function public.cleanup_orphan_inbound_pending(interval) from public, anon;
grant execute on function public.cleanup_orphan_inbound_pending(interval) to authenticated;
