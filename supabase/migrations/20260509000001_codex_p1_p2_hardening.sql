-- Codex review (PR #5) 보정 — P1×2 + P2×1 통합 마이그레이션.
--
-- P1-A: stock_orders 의 self_insert RLS 정책으로 클라이언트가 임의 행을 INSERT 할 수 있어,
--       items / total_amount 를 조작한 pending 을 만들고 admin 승인 시 무료 재고 적립이 가능했다.
--       정책을 제거해 request_stock_order RPC (SECURITY DEFINER) 만 INSERT 가능하게 한다.
--
-- P1-B: order_uploads.shipping_fee_total 이 self_insert 정책 아래에서 클라이언트 통제 가능해
--       0원 배송이 가능했다. CHECK 제약과 RPC 재검증을 동시에 도입해 다층 방어한다.
--
-- P2:   request_stock_order 의 per_user_limit 합산이 legacy orders/order_items 의 누적을
--       무시해 옛 흐름에서 산 수량이 한도에 포함되지 않았다. 합산식에 legacy 도 더한다.

-- === P1-A: stock_orders self_insert 정책 제거 ===
drop policy if exists stock_orders_self_insert on public.stock_orders;

-- === P1-B-1: order_uploads 의 shipping_fee_total 일관성 CHECK ===
-- 기존 데이터(rejected 등)에 영향이 없도록 NOT VALID 로 추가. 새 INSERT/UPDATE 부터 강제.
alter table public.order_uploads
  add constraint order_uploads_fee_consistent
  check (shipping_fee_total = jsonb_array_length(items) * 3300) not valid;

-- === P1-B-2 + P2: 두 RPC 동시 갱신 ===

-- approve_shipping_upload: FEE_TAMPERED 가드 추가
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

  -- legacy items 감지: 새 흐름은 server action 이 product_id 를 미리 채움.
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 배송비 재계산 가드: 행수 × 3300 과 다르면 변조로 간주.
  v_expected_fee := jsonb_array_length(v_upload.items) * 3300;
  if v_upload.shipping_fee_total <> v_expected_fee then
    raise exception 'FEE_TAMPERED:%:%', v_expected_fee, v_upload.shipping_fee_total;
  end if;

  -- 보유 재고 사전 검증 (product_id 직접 매칭)
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

  -- 보유 재고 차감 — conditional UPDATE 로 동시 승인 race 직렬화.
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := (v_row->>'product_id')::uuid;
    if v_product_id is null then
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;

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


-- request_stock_order: per_user_limit 합산에 legacy orders/order_items 합산 추가.
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
  v_legacy_qty int;
  v_check record;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  -- per_user_limit 합산 검사: 승인 stock_orders + 검토대기 stock_orders + legacy orders + 신규
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

    -- legacy 일반 주문(orders + order_items)에서 같은 product_id 의 누적 수량.
    -- cancelled 는 제외하고 모두 한도에 포함한다.
    select coalesce(sum(oi.quantity), 0)::int into v_legacy_qty
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.user_id = v_user_id
        and o.status <> 'cancelled'
        and oi.product_id = v_check.product_id;

    if v_already_bought + v_pending_qty + v_legacy_qty + v_check.batch_qty > v_check.per_user_limit then
      raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%',
        v_check.product_id, v_check.per_user_limit,
        v_already_bought + v_pending_qty + v_legacy_qty;
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
