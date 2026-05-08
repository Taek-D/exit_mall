-- Phase 1.5 안정화: approve_shipping_upload RPC 에 legacy items 감지 가드 추가.
-- 신규 흐름의 items 는 {recipient, phone, address, product_code, quantity, ...} 구조.
-- 옛 흐름의 items 는 {brand, code, name, option, quantity, unit_price, ...} 구조라
-- product_code 가 없는 행이 하나라도 있으면 LEGACY_ITEMS_NOT_SUPPORTED 로 차단한다.

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

  -- legacy items 감지: 새 양식의 필수 필드(product_code) 가 없는 행이 하나라도 있으면 차단.
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_code') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 보유 재고 검증 (상품별 합산)
  for v_check in
    with rows as (
      select (it->>'product_code') as code,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
    ),
    by_product as (
      select p.id as product_id, sum(r.quantity)::int as need_qty
      from rows r
      join public.products p on p.name = r.code or p.id::text = r.code
      group by p.id
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

  -- 예치금 (배송비) 검증
  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 + movements 기록 (행 단위)
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select id into v_product_id
      from public.products
      where name = (v_row->>'product_code') or id::text = (v_row->>'product_code')
      limit 1;
    if v_product_id is null then
      raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_code';
    end if;

    update public.user_inventory
      set quantity = quantity - v_qty, updated_at = now()
      where user_id = v_upload.user_id and product_id = v_product_id;

    insert into public.inventory_movements
      (user_id, product_id, delta, source_type, source_id)
    values
      (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);
  end loop;

  -- 배송비 차감
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
