-- Phase 1.4: order_uploads — 새 양식 + 송장 재업로드 + 상태 확장

alter table public.order_uploads
  add column shipping_fee_total bigint not null default 0,
  add column admin_storage_path text,
  add column shipped_at timestamptz,
  add column completed_at timestamptz;

-- 기존 status check 제거 후 확장된 status check 추가
alter table public.order_uploads drop constraint if exists order_uploads_status_check;
alter table public.order_uploads
  add constraint order_uploads_status_check
  check (status in ('pending','approved','rejected','failed','shipped','completed','cancelled'));

-- 송장 재업로드용 storage 정책. admin_storage_path 는 user_id 폴더가 아니라 'admin/' 접두를
-- 사용하므로 owner_read 정책으로는 못 읽는다. 고객도 자신의 admin 업로드본을 읽을 수 있어야 한다.
-- → order_uploads 행 단위로 권한 판정하는 별도 정책으로 처리.

create policy "order-uploads admin file owner read" on storage.objects
  for select using (
    bucket_id = 'order-uploads'
    and (
      public.is_admin()
      or exists (
        select 1 from public.order_uploads ou
        where ou.admin_storage_path = name
          and ou.user_id = auth.uid()
      )
    )
  );

-- shipping_fee_total 의 도메인 검사: 양수 정수
alter table public.order_uploads
  add constraint order_uploads_shipping_fee_nonneg
  check (shipping_fee_total >= 0);
