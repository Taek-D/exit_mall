-- Codex review round 2 (PR #5) — P1×2 + P2×1.
-- (P2 inventory page fix 는 마이그레이션 외 코드 수정으로 별도 처리)
--
-- P1-A: order_uploads_self_insert 정책이 admin_storage_path 를 강제하지 않아
--       사용자가 임의 경로를 넣어 storage admin file owner read 정책을 우회 가능.
-- P1-B: approve_shipping_upload 가 product_code↔product_id 일관성 검사 없이 product_id 로 차감.
--       사용자가 화면 표시(code) 와 실제 차감(id) 이 다른 row 를 INSERT 가능.
-- P2-A: attach_tracking 이 items 전체를 덮어써 비-tracking 필드 변조 가능.
--       PL/pgSQL loop 으로 tracking 만 갱신해 감사 무결성 보장.

-- === P1-A: order_uploads_self_insert 강화 + storage policy 강화 ===
drop policy if exists order_uploads_self_insert on public.order_uploads;
create policy order_uploads_self_insert on public.order_uploads
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    -- 일반 사용자는 admin_storage_path 를 설정할 수 없다.
    -- attach_tracking RPC (SECURITY DEFINER) 만 채울 수 있음.
    and admin_storage_path is null
  );

drop policy if exists "order-uploads admin file owner read" on storage.objects;
create policy "order-uploads admin file owner read" on storage.objects
  for select using (
    bucket_id = 'order-uploads'
    and (
      public.is_admin()
      or exists (
        select 1 from public.order_uploads ou
        where ou.admin_storage_path = name
          and ou.user_id = auth.uid()
          and name like 'admin/%'
      )
    )
  );

-- === P1-B: approve_shipping_upload 에 product_code↔product_id 일관성 가드 추가 ===
create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_qty int;
  v_check record;
  v_expected_fee bigint;
  v_resolved_name text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  -- legacy items 감지
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 배송비 변조 가드
  v_expected_fee := jsonb_array_length(v_upload.items) * 3300;
  if v_upload.shipping_fee_total <> v_expected_fee then
    raise exception 'FEE_TAMPERED:%:%', v_expected_fee, v_upload.shipping_fee_total;
  end if;

  -- product_code ↔ product_id 일관성 가드:
  -- items 의 product_id 가 가리키는 상품의 name 이 product_code 와 같아야 한다.
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    select name into v_resolved_name
      from public.products
      where id = (v_row->>'product_id')::uuid;
    if v_resolved_name is null then
      raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_id';
    end if;
    if v_resolved_name <> (v_row->>'product_code') then
      raise exception 'PRODUCT_MISMATCH:%:%:%',
        v_row->>'product_id', v_row->>'product_code', v_resolved_name;
    end if;
  end loop;

  -- 보유 재고 사전 검증
  for v_check in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
    ),
    by_product as (
      select product_id, sum(quantity)::int as need_qty
      from rows group by product_id
    )
    select bp.product_id, bp.need_qty,
           coalesce(ui.quantity, 0) as available
    from by_product bp
    left join public.user_inventory ui
      on ui.user_id = v_upload.user_id and ui.product_id = bp.product_id
  loop
    if v_check.available < v_check.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_check.product_id, v_check.need_qty, v_check.available;
    end if;
  end loop;

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 — conditional UPDATE 로 직렬화
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := (v_row->>'product_id')::uuid;

    update public.user_inventory
      set quantity = quantity - v_qty, updated_at = now()
      where user_id = v_upload.user_id
        and product_id = v_product_id
        and quantity >= v_qty;
    if not found then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_product_id, v_qty,
        coalesce((select quantity from public.user_inventory
                  where user_id = v_upload.user_id and product_id = v_product_id), 0);
    end if;

    insert into public.inventory_movements
      (user_id, product_id, delta, source_type, source_id)
    values
      (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);
  end loop;

  update public.profiles set deposit_balance = deposit_balance - v_upload.shipping_fee_total
    where id = v_user.id;

  insert into public.balance_transactions
    (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values
    (v_user.id, 'order', -v_upload.shipping_fee_total,
     v_user.deposit_balance - v_upload.shipping_fee_total,
     'shipping_upload', v_upload.id, v_admin, '배송대행 승인 (배송비)');

  update public.order_uploads
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.approve_shipping_upload(uuid) to authenticated;


-- === P2-A: attach_tracking 이 tracking 만 갱신, 비-tracking 필드 보존 ===
create or replace function public.attach_tracking(
  upload_id uuid,
  storage_path text,
  parsed_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_upload record;
  v_new_items jsonb := '[]'::jsonb;
  v_orig jsonb;
  v_new_track text;
  i int;
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

  -- 원본 items 의 모든 필드를 보존하고 tracking_number 만 갱신.
  -- 비어있으면 null 유지(미발송), 채워졌으면 그 값으로 set.
  for i in 0 .. jsonb_array_length(v_upload.items) - 1 loop
    v_orig := v_upload.items -> i;
    v_new_track := parsed_items -> i ->> 'tracking_number';
    if v_new_track is null or length(v_new_track) = 0 then
      v_new_items := v_new_items || jsonb_set(v_orig, '{tracking_number}', 'null'::jsonb);
    else
      v_new_items := v_new_items || jsonb_set(v_orig, '{tracking_number}', to_jsonb(v_new_track));
    end if;
  end loop;

  update public.order_uploads
    set items = v_new_items,
        admin_storage_path = attach_tracking.storage_path,
        status = 'shipped',
        shipped_at = coalesce(shipped_at, now())
    where id = upload_id;
end; $$;

grant execute on function public.attach_tracking(uuid, text, jsonb) to authenticated;
