-- Codex P1 follow-up: the owner-delete policy on order-uploads bucket lets any
-- authenticated user delete any object under their `order-uploads/<uid>/...`
-- folder, including files already tied to approved/rejected order_uploads
-- records. That breaks the audit trail and lets users tamper with historical
-- evidence by deleting workbooks admins might still need.
--
-- The rollback use case only needs to clean up *orphan* storage objects (i.e.
-- when storage upload succeeded but the DB insert failed and no
-- order_uploads row references the object). Restrict the policy to that
-- shape: owner may delete their own object only when no order_uploads row
-- references it. After insert succeeds, the file is effectively immutable
-- from the user's perspective.

drop policy if exists "order-uploads owner delete" on storage.objects;

create policy "order-uploads owner delete" on storage.objects
  for delete using (
    bucket_id = 'order-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
    and not exists (
      select 1 from public.order_uploads ou
      where ou.storage_path = storage.objects.name
    )
  );
