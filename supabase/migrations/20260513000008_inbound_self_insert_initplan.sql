-- ============================================================================
-- Wrap inbound_requests_self_insert in (select ...) to clear the last
-- auth_rls_initplan warning on inbound tables. The session-flag check
-- continues to enforce RPC-only inserts.
-- ============================================================================

drop policy if exists inbound_requests_self_insert on public.inbound_requests;
create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (
    user_id = (select auth.uid())
    and (select public.is_active())
    and coalesce((select current_setting('app.inbound_rpc', true)), '') = 'true'
  );
