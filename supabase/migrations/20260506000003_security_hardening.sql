-- Security hardening based on code review:
-- P1-1: Tighten order_uploads INSERT policy (prevent users from forging review/order/status fields).
-- P2-3: Aggregate same-product items in place_order before per_user_limit check.
-- P2-4: Apply per_user_limit to excel-approved orders when a product code matches.
-- P2-5: Allow storage owners to delete their own pending uploads (rollback path).

-- ============================================================
-- P1-1: order_uploads insert policy
-- ============================================================
drop policy if exists order_uploads_self_insert on public.order_uploads;

create policy order_uploads_self_insert on public.order_uploads
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and status = 'pending'
    and admin_memo is null
    and parse_error is null
    and reviewed_by is null
    and reviewed_at is null
    and order_id is null
    -- Force storage_path to live under the user's own folder.
    and storage_path like (auth.uid()::text || '/%')
  );

-- ============================================================
-- P2-5: storage order-uploads — owner delete policy (for rollback on insert failure)
-- ============================================================
create policy "order-uploads owner delete" on storage.objects
  for delete using (
    bucket_id = 'order-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- P2-3: place_order — aggregate duplicate items + close per_user_limit bypass
-- ============================================================
create or replace function public.place_order(items jsonb, shipping jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_balance bigint;
  v_total bigint := 0;
  v_order_id uuid;
  v_agg jsonb;
  v_agg_item jsonb;
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

  -- Aggregate duplicate product_id entries so per_user_limit/stock checks see the true total.
  with raw as (
    select (e->>'product_id')::uuid as product_id,
           coalesce((e->>'quantity')::int, 0) as quantity
    from jsonb_array_elements(items) as e
  ),
  agg as (
    select product_id, sum(quantity)::int as quantity
    from raw
    group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity)), '[]'::jsonb)
  into v_agg
  from agg;

  insert into public.orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, shipping_memo)
  values (v_user_id, 0, 'placed', shipping->>'name', shipping->>'phone', shipping->>'address', nullif(shipping->>'memo',''))
  returning id into v_order_id;

  for v_agg_item in select * from jsonb_array_elements(v_agg) loop
    v_qty := (v_agg_item->>'quantity')::int;
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_agg_item->>'product_id')::uuid for update;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_agg_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    if v_product.per_user_limit is not null then
      -- Sum quantity across user's prior non-cancelled orders (current order has no rows yet here).
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

-- ============================================================
-- P2-4: approve_order_upload — apply per_user_limit when product code matches
--   Excel uploads are explicitly "manual exception orders": product_id stays NULL because
--   the rows may not all exist in our products master. To still honor the per-user cap,
--   we resolve names against products.name (case-insensitive), and when a match exists
--   we link the order_item to that product and run the same per_user_limit check.
-- ============================================================
create or replace function public.approve_order_upload(upload_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_order_id uuid;
  v_item jsonb;
  v_qty int;
  v_unit_price bigint;
  v_subtotal bigint;
  v_total bigint := 0;
  v_count int := 0;
  v_resolved_id uuid;
  v_already_bought int;
  v_per_user_limit int;
  v_product_name text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  if v_upload.shipping_address is null or length(v_upload.shipping_address) = 0
     or v_upload.contact_person is null or length(v_upload.contact_person) = 0
     or v_upload.buyer_phone is null or length(v_upload.buyer_phone) = 0 then
    raise exception 'MISSING_SHIPPING';
  end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  insert into public.orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, shipping_memo)
  values (
    v_upload.user_id,
    0,
    'placed',
    coalesce(v_upload.contact_person, v_upload.company_name, ''),
    v_upload.buyer_phone,
    v_upload.shipping_address,
    nullif(v_upload.request_memo, '')
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::bigint, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY:%', v_item; end if;
    if v_unit_price < 0 then raise exception 'INVALID_PRICE:%', v_item; end if;

    v_product_name := coalesce(v_item->>'name', '(이름 없음)');

    -- Resolve to a known product by exact name (case-insensitive).
    select id, per_user_limit into v_resolved_id, v_per_user_limit
      from public.products
      where lower(name) = lower(v_product_name)
      limit 1;

    if v_resolved_id is not null and v_per_user_limit is not null then
      select coalesce(sum(oi.quantity), 0)::int into v_already_bought
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.product_id = v_resolved_id
          and o.user_id = v_upload.user_id
          and o.status <> 'cancelled'
          and o.id <> v_order_id;
      if v_already_bought + v_qty > v_per_user_limit then
        raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%', v_resolved_id, v_per_user_limit, v_already_bought;
      end if;
    end if;

    v_subtotal := v_unit_price * v_qty;
    v_total := v_total + v_subtotal;
    v_count := v_count + 1;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_resolved_id, v_product_name, v_unit_price, v_qty, v_subtotal);
  end loop;

  if v_count = 0 then raise exception 'EMPTY_ITEMS'; end if;

  if v_user.deposit_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles set deposit_balance = deposit_balance - v_total where id = v_user.id;
  update public.orders set total_amount = v_total where id = v_order_id;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values (v_user.id, 'order', -v_total, v_user.deposit_balance - v_total, 'order', v_order_id, v_admin, '엑셀 주문 승인');

  update public.order_uploads
    set status = 'approved',
        reviewed_by = v_admin,
        reviewed_at = now(),
        order_id = v_order_id
    where id = upload_id;

  return v_order_id;
end; $$;

grant execute on function public.approve_order_upload(uuid) to authenticated;
