-- Phase 5 누락 보정: admin이 attach_tracking 시 admin/<uploadId>/... 경로에 INSERT 가능하도록.
-- 기존 owner-write 정책은 user_id 폴더만 허용했고, admin update 정책은 UPDATE만 커버.

create policy "order-uploads admin write" on storage.objects
  for insert with check (
    bucket_id = 'order-uploads'
    and public.is_admin()
  );
