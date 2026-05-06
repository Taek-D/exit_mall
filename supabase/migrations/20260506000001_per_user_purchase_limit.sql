-- Phase 1: per-user purchase limit per product
-- NULL = unlimited (default). Positive integer = max cumulative quantity per user across non-cancelled orders.

alter table public.products
  add column if not exists per_user_limit int
  check (per_user_limit is null or per_user_limit >= 1);

-- Update place_order to enforce per_user_limit.
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
  v_already_bought int;
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

    -- Per-user limit check (sums quantity across all non-cancelled orders by this user for this product)
    if v_product.per_user_limit is not null then
      select coalesce(sum(oi.quantity), 0)::int into v_already_bought
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.product_id = v_product.id
          and o.user_id = v_user_id
          and o.status <> 'cancelled'
          and o.id <> v_order_id;
      if v_already_bought + v_qty > v_product.per_user_limit then
        raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%', v_product.id, v_product.per_user_limit, v_already_bought;
      end if;
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
