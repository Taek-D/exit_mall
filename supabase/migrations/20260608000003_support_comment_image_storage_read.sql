-- Let the support request owner read admin comment image objects.

create policy "support-requests comment image request owner read" on storage.objects
  for select using (
    bucket_id = 'support-requests'
    and exists (
      select 1
      from public.support_request_comment_images i
      join public.support_requests r on r.id = i.request_id
      where i.storage_path = storage.objects.name
        and r.user_id = auth.uid()
    )
  );
