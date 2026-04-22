-- Places an order. Deducts balance + stock atomically. Returns order_id.
create or replace function public.place_order(items jsonb, shipping jsonb)
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
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  if shipping->>'name' is null or length(shipping->>'name') = 0
     or shipping->>'phone' is null or length(shipping->>'phone') = 0
     or shipping->>'address' is null or length(shipping->>'address') = 0 then
    raise exception 'INVALID_SHIPPING';
  end if;

  insert into public.orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, shipping_memo)
  values (v_user_id, 0, 'placed', shipping->>'name', shipping->>'phone', shipping->>'address', nullif(shipping->>'memo',''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid for update;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    if v_product.stock >= 0 then
      update public.products set stock = stock - v_qty where id = v_product.id;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_subtotal);
  end loop;

  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles set deposit_balance = deposit_balance - v_total where id = v_user_id;
  update public.orders set total_amount = v_total where id = v_order_id;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, memo)
  values (v_user_id, 'order', -v_total, v_balance - v_total, 'order', v_order_id, null);

  return v_order_id;
end; $$;

grant execute on function public.place_order(jsonb, jsonb) to authenticated;


-- Confirm a pending deposit request. Admin only.
create or replace function public.confirm_deposit(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_balance bigint;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.deposit_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.deposit_requests
    set status='confirmed', confirmed_by = v_admin, confirmed_at = now()
    where id = request_id;

  update public.profiles set deposit_balance = deposit_balance + v_req.amount
    where id = v_req.user_id returning deposit_balance into v_balance;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id)
  values (v_req.user_id, 'deposit', v_req.amount, v_balance, 'deposit_request', v_req.id, v_admin);
end; $$;

grant execute on function public.confirm_deposit(uuid) to authenticated;


-- Reject a pending deposit request. Admin only.
create or replace function public.reject_deposit(request_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_req from public.deposit_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.deposit_requests
    set status='rejected', admin_memo = memo, confirmed_by = auth.uid(), confirmed_at = now()
    where id = request_id;
end; $$;

grant execute on function public.reject_deposit(uuid, text) to authenticated;


-- Cancel an order. Owner can cancel in 'placed'. Admin can cancel any non-cancelled.
create or replace function public.cancel_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_admin bool := public.is_admin();
  v_order record;
  v_item record;
  v_balance bigint;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_order from public.orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;

  if v_admin then
    if v_order.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  else
    if v_order.user_id <> v_user then raise exception 'FORBIDDEN'; end if;
    if v_order.status <> 'placed' then raise exception 'NOT_CANCELLABLE'; end if;
  end if;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id loop
    if v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity
        where id = v_item.product_id and stock >= 0;
    end if;
  end loop;

  update public.profiles set deposit_balance = deposit_balance + v_order.total_amount
    where id = v_order.user_id returning deposit_balance into v_balance;

  update public.orders set status = 'cancelled' where id = v_order.id;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values (v_order.user_id, 'refund', v_order.total_amount, v_balance, 'order', v_order.id,
          case when v_admin and v_order.user_id <> v_user then v_user else null end,
          'Order cancelled');
end; $$;

grant execute on function public.cancel_order(uuid) to authenticated;


-- Manual balance adjustment. Admin only. delta may be negative; must not make balance negative.
create or replace function public.adjust_balance(target_user uuid, delta bigint, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_new bigint;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select deposit_balance into v_balance from public.profiles where id = target_user for update;
  if v_balance is null then raise exception 'USER_NOT_FOUND'; end if;
  v_new := v_balance + delta;
  if v_new < 0 then raise exception 'NEGATIVE_BALANCE'; end if;

  update public.profiles set deposit_balance = v_new where id = target_user;
  insert into public.balance_transactions (user_id, type, amount, balance_after, admin_id, memo)
  values (target_user, 'adjust', delta, v_new, auth.uid(), memo);
end; $$;

grant execute on function public.adjust_balance(uuid, bigint, text) to authenticated;


-- Transition order status. Admin only. shipped requires tracking+carrier.
create or replace function public.transition_order_status(
  order_id uuid, next_status text, tracking text default null, carrier_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;

  if next_status = 'preparing' and v_order.status = 'placed' then
    update public.orders set status = 'preparing' where id = order_id;
  elsif next_status = 'shipped' and v_order.status = 'preparing' then
    if tracking is null or length(tracking) = 0 or carrier_name is null or length(carrier_name) = 0 then
      raise exception 'TRACKING_REQUIRED';
    end if;
    update public.orders set status='shipped', tracking_number=tracking, carrier=carrier_name, shipped_at=now()
      where id = order_id;
  elsif next_status = 'delivered' and v_order.status = 'shipped' then
    update public.orders set status='delivered' where id = order_id;
  else
    raise exception 'INVALID_TRANSITION:% -> %', v_order.status, next_status;
  end if;
end; $$;

grant execute on function public.transition_order_status(uuid, text, text, text) to authenticated;

-- Enable Realtime on orders table (for admin dashboard live updates)
alter publication supabase_realtime add table public.orders;
