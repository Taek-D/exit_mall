-- ============================================================================
-- Inbound RLS auth_rls_initplan optimization.
-- Wraps auth.uid() / is_admin() / is_active() in (select ...) so they are
-- evaluated once per query instead of once per row. inbound_requests_self_insert
-- was already rewritten in 20260513000004 for the RPC chokepoint and is omitted
-- from this migration.
-- ============================================================================

-- === inbound_requests ========================================================
drop policy if exists inbound_requests_owner_admin_select on public.inbound_requests;
create policy inbound_requests_owner_admin_select on public.inbound_requests
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists inbound_requests_self_update on public.inbound_requests;
create policy inbound_requests_self_update on public.inbound_requests
  for update
  using (user_id = (select auth.uid()) and status = 'open')
  with check (user_id = (select auth.uid()) and status = 'open');

drop policy if exists inbound_requests_self_delete on public.inbound_requests;
create policy inbound_requests_self_delete on public.inbound_requests
  for delete using (user_id = (select auth.uid()) and status = 'open');

drop policy if exists inbound_requests_admin_all on public.inbound_requests;
create policy inbound_requests_admin_all on public.inbound_requests
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- === inbound_request_comments ================================================
drop policy if exists inbound_comments_select on public.inbound_request_comments;
create policy inbound_comments_select on public.inbound_request_comments
  for select using (
    exists (
      select 1 from public.inbound_requests r
      where r.id = request_id
        and (r.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists inbound_comments_self_update on public.inbound_request_comments;
create policy inbound_comments_self_update on public.inbound_request_comments
  for update using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists inbound_comments_self_delete on public.inbound_request_comments;
create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete using (author_id = (select auth.uid()));

drop policy if exists inbound_comments_admin_all on public.inbound_request_comments;
create policy inbound_comments_admin_all on public.inbound_request_comments
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- === storage.objects (bucket: inbound-requests) ==============================
drop policy if exists "inbound-requests owner read" on storage.objects;
create policy "inbound-requests owner read" on storage.objects
  for select using (
    bucket_id = 'inbound-requests'
    and ((select auth.uid())::text = (storage.foldername(name))[1] or (select public.is_admin()))
  );

drop policy if exists "inbound-requests owner write" on storage.objects;
create policy "inbound-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and (select public.is_active())
  );

drop policy if exists "inbound-requests owner update" on storage.objects;
create policy "inbound-requests owner update" on storage.objects
  for update using (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "inbound-requests owner delete" on storage.objects;
create policy "inbound-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "inbound-requests admin all" on storage.objects;
create policy "inbound-requests admin all" on storage.objects
  for all using (bucket_id = 'inbound-requests' and (select public.is_admin()))
  with check (bucket_id = 'inbound-requests' and (select public.is_admin()));
