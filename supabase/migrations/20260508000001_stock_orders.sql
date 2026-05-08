-- Phase 1.1: stock_orders — 엑시트몰 상품 구매 (검토대기 → 승인 시 보유 재고 적립)

create table public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),

  total_amount bigint not null default 0,

  -- [{product_id, product_name, qty, unit_price, subtotal}]
  items jsonb not null default '[]'::jsonb,

  admin_memo text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index stock_orders_user_idx on public.stock_orders (user_id, created_at desc);
create index stock_orders_status_idx on public.stock_orders (status, created_at desc);

alter table public.stock_orders enable row level security;

create policy stock_orders_self_select on public.stock_orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy stock_orders_self_insert on public.stock_orders
  for insert with check (user_id = auth.uid() and public.is_active());

create policy stock_orders_admin_all on public.stock_orders
  for all using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.stock_orders;

-- === RPC: request_stock_order (authenticated user) ===
-- pending 생성. 차감 없음. 1인 한도는 (승인 + 검토대기 + 신규) 합으로 검사.
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

  -- per_user_limit 합산 검사: 승인된 stock_orders + 검토대기 stock_orders + 신규 요청
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
    -- 이미 승인된 stock_orders의 누적 수량
    select coalesce(sum((it->>'qty')::int), 0)::int into v_already_bought
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'approved'
        and (it->>'product_id')::uuid = v_check.product_id;

    -- 검토대기 stock_orders 의 누적 수량
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

  -- 정규화 + 마스터 재고 가용성 사전 체크 (음수 stock 무제한 처리)
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

  -- 가용 잔액 체크: balance - 검토대기 stock_orders 합계
  -- (검토대기 shipping_uploads 배송비는 Phase 1.4 이후 별도 RPC에서 처리)
  select coalesce(sum(total_amount), 0) into v_pending_committed
    from public.stock_orders
    where user_id = v_user_id and status = 'pending';

  if v_balance - v_pending_committed < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.stock_orders (user_id, status, total_amount, items)
  values (v_user_id, 'pending', v_total, v_normalized)
  returning id into v_order_id;

  return v_order_id;
end; $$;

grant execute on function public.request_stock_order(jsonb) to authenticated;

-- === RPC: approve_stock_order (admin only) ===
create or replace function public.approve_stock_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_order record;
  v_user record;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_order.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;
  if v_user.deposit_balance < v_order.total_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 마스터 재고 차감 + user_inventory 적립 + movements 기록
  for v_item in select * from jsonb_array_elements(v_order.items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;

    update public.products set stock = stock - v_qty
      where id = v_product_id and (stock < 0 or stock >= v_qty);
    if not found then
      raise exception 'OUT_OF_STOCK:%', v_product_id;
    end if;

    insert into public.user_inventory (user_id, product_id, quantity, updated_at)
    values (v_order.user_id, v_product_id, v_qty, now())
    on conflict (user_id, product_id)
    do update set quantity = public.user_inventory.quantity + excluded.quantity,
                  updated_at = now();

    insert into public.inventory_movements
      (user_id, product_id, delta, source_type, source_id)
    values
      (v_order.user_id, v_product_id, v_qty, 'stock_order_approved', v_order.id);
  end loop;

  -- 예치금 차감 + balance_transactions 기록
  update public.profiles set deposit_balance = deposit_balance - v_order.total_amount
    where id = v_order.user_id;

  insert into public.balance_transactions
    (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values
    (v_order.user_id, 'order', -v_order.total_amount,
     v_user.deposit_balance - v_order.total_amount,
     'stock_order', v_order.id, v_admin, '재고 적립 승인');

  update public.stock_orders
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = order_id;
end; $$;

grant execute on function public.approve_stock_order(uuid) to authenticated;

-- === RPC: reject_stock_order (admin only) ===
create or replace function public.reject_stock_order(order_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.stock_orders
    set status = 'rejected', admin_memo = memo,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = order_id;
end; $$;

grant execute on function public.reject_stock_order(uuid, text) to authenticated;

-- === RPC: cancel_stock_order (owner only, pending only) ===
create or replace function public.cancel_stock_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_order.status <> 'pending' then raise exception 'NOT_CANCELLABLE'; end if;

  update public.stock_orders set status = 'cancelled' where id = order_id;
end; $$;

grant execute on function public.cancel_stock_order(uuid) to authenticated;
