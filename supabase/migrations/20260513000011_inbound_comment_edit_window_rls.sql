-- ============================================================================
-- Codex review P1 (PR #9) — enforce 10-minute comment edit/delete window in
-- RLS as well. The window was only enforced in server actions, so a user could
-- bypass it by calling PostgREST directly with their JWT and rewrite/delete
-- old discussion history. created_at is pinned by inbound_comments_pin_columns
-- trigger for non-admins, so we can safely guard with `now() < created_at + 10m`.
-- Admin retains unrestricted access via inbound_comments_admin_all.
-- ============================================================================

drop policy if exists inbound_comments_self_update on public.inbound_request_comments;
create policy inbound_comments_self_update on public.inbound_request_comments
  for update
  using (
    author_id = (select auth.uid())
    and now() < created_at + interval '10 minutes'
  )
  with check (
    author_id = (select auth.uid())
    and now() < created_at + interval '10 minutes'
  );

drop policy if exists inbound_comments_self_delete on public.inbound_request_comments;
create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete
  using (
    author_id = (select auth.uid())
    and now() < created_at + interval '10 minutes'
  );
