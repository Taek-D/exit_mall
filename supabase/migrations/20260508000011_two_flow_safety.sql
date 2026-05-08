-- Phase 1 안정화 (Codex P1·P2 보정):
-- 1) request_stock_order 의 가용 잔액 검사가 pending stock_orders 합계만 빼고
--    pending order_uploads.shipping_fee_total 은 무시했다. 두 흐름이 같은 예치금을
--    예약하므로 둘 다 빼야 한다.
-- 2) approve_shipping_upload 의 보유 재고 검증이 user_inventory 에 락을 걸지 않아
--    두 관리자가 같은 user/product 다른 업로드를 동시 승인하면 둘 다 통과 후
--    차감 시점에 한쪽이 실패할 수 있다. 차감 UPDATE 에 quantity 가드를 두어
--    atomic 하게 직렬화한다.

-- === request_stock_order: pending shipping_fee_total 도 예약으로 차감 ===
create or replace function public.request_stock_order(items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_balance bigint;
  v_total bigint := 0;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_subtotal bigint;
  v_normalized jsonb := '[]'::jsonb;
  v_pending_committed bigint := 0;
  v_already_bought int;
  v_pending_qty int;
  v_check record;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  -- per_user_limit 합산 검사
  for v_check in
    with input_rows as (
      select (e->>'product_id')::uuid as product_id,
             coalesce((e->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(items) as e
    ),
    matched as (
      select ir.product_id, ir.quantity, p.per_user_limit
      from input_rows ir
      join public.products p on p.id = ir.product_id
      where p.per_user_limit is not null
    )
    select product_id, per_user_limit, sum(quantity)::int as batch_qty
    from matched group by product_id, per_user_limit
  loop
    select coalesce(sum((it->>'qty')::int), 0)::int into v_already_bought
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'approved'
        and (it->>'product_id')::uuid = v_check.product_id;

    select coalesce(sum((it->>'qty')::int), 0)::int into v_pending_qty
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'pending'
        and (it->>'product_id')::uuid = v_check.product_id;

    if v_already_bought + v_pending_qty + v_check.batch_qty > v_check.per_user_limit then
      raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%',
        v_check.product_id, v_check.per_user_limit, v_already_bought + v_pending_qty;
    end if;
  end loop;

  -- 정규화 + 마스터 재고 가용성 사전 체크
  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    v_normalized := v_normalized || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'qty', v_qty,
      'unit_price', v_product.price,
      'subtotal', v_subtotal
    );
  end loop;

  -- 가용 잔액 = balance - 검토대기 stock_orders 합계 - 검토대기 shipping_uploads 배송비 합계
  select coalesce(sum(total_amount), 0) into v_pending_committed
    from public.stock_orders
    where user_id = v_user_id and status = 'pending';

  v_pending_committed := v_pending_committed + coalesce((
    select sum(shipping_fee_total)
    from public.order_uploads
    where user_id = v_user_id and status = 'pending'
  ), 0);

  if v_balance - v_pending_committed < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.stock_orders (user_id, status, total_amount, items)
  values (v_user_id, 'pending', v_total, v_normalized)
  returning id into v_order_id;

  return v_order_id;
end; $$;

grant execute on function public.request_stock_order(jsonb) to authenticated;


-- === approve_shipping_upload: 차감 UPDATE 에 quantity 가드로 직렬화 ===
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

  -- legacy items 가드
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_code') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 보유 재고 사전 검증 (검증 단계에서 락은 차감 단계의 conditional UPDATE 로 보장)
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

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 — conditional UPDATE 로 동시 승인 race 직렬화.
  -- quantity >= v_qty 조건이 만족하지 않으면 NOT FOUND → 같은 에러로 즉시 차단.
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
      where user_id = v_upload.user_id
        and product_id = v_product_id
        and quantity >= v_qty;
    if not found then
      -- 사전 검증을 통과했지만 다른 트랜잭션이 같은 행을 먼저 차감해 부족해진 경우.
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
