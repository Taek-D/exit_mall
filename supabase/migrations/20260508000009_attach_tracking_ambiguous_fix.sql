-- Phase 1.5 보정: attach_tracking RPC 의 storage_path 인자명이 order_uploads.storage_path 컬럼과
-- 충돌해 'column reference is ambiguous' 에러 발생. 함수명 prefix 로 명시 해소.

create or replace function public.attach_tracking(
  upload_id uuid,
  storage_path text,
  parsed_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status not in ('approved','shipped') then
    raise exception 'INVALID_STATE:%', v_upload.status;
  end if;

  if jsonb_array_length(v_upload.items) <> jsonb_array_length(parsed_items) then
    raise exception 'ROW_COUNT_MISMATCH:%:%',
      jsonb_array_length(v_upload.items), jsonb_array_length(parsed_items);
  end if;

  update public.order_uploads
    set items = parsed_items,
        admin_storage_path = attach_tracking.storage_path,
        status = 'shipped',
        shipped_at = coalesce(shipped_at, now())
    where id = upload_id;
end; $$;

grant execute on function public.attach_tracking(uuid, text, jsonb) to authenticated;
