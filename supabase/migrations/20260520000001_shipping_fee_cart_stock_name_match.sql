create or replace function public.product_match_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\s+', '', 'g')
$$;

grant execute on function public.product_match_key(text) to authenticated;

create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_custom_id uuid;
  v_qty int;
  v_pcheck record;
  v_ccheck record;
  v_expected_fee bigint;
  v_resolved_name text;
  v_alloc_check record;
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

  v_expected_fee := jsonb_array_length(v_upload.items)::bigint * 3300;
  if v_upload.shipping_fee_total <> v_expected_fee then
    raise exception 'INVALID_FEE:%:%', v_upload.shipping_fee_total, v_expected_fee;
  end if;

  if coalesce(v_upload.upload_type, 'exitmall') = 'purchased' then
    if not exists (
      select 1 from public.purchased_shipping_allocations psa
      where psa.upload_id = v_upload.id
    ) then
      raise exception 'EMPTY_ALLOCATIONS';
    end if;

    for v_alloc_check in
      select psa.lot_id, sum(psa.quantity)::int as quantity
      from public.purchased_shipping_allocations psa
      where psa.upload_id = v_upload.id
      group by psa.lot_id
    loop
      update public.purchased_inventory_lots
        set remaining_quantity = remaining_quantity - v_alloc_check.quantity
        where id = v_alloc_check.lot_id
          and user_id = v_upload.user_id
          and remaining_quantity >= v_alloc_check.quantity;
      if not found then
        raise exception 'INSUFFICIENT_PURCHASED_INVENTORY:%:%:%',
          v_alloc_check.lot_id,
          v_alloc_check.quantity,
          coalesce((select remaining_quantity from public.purchased_inventory_lots
                    where id = v_alloc_check.lot_id and user_id = v_upload.user_id), 0);
      end if;
    end loop;

    update public.order_uploads
      set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
      where id = upload_id;
    return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is not null
      and (it->>'custom_inventory_id') is not null
  ) then
    raise exception 'INVALID_ITEM_BOTH_IDS';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null and (it->>'custom_inventory_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    if (v_row->>'product_id') is not null then
      select name into v_resolved_name
        from public.products
        where id = (v_row->>'product_id')::uuid;
      if v_resolved_name is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_id';
      end if;
      if public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code') then
        raise exception 'PRODUCT_MISMATCH:%:%:%',
          v_row->>'product_id', v_row->>'product_code', v_resolved_name;
      end if;
    elsif (v_row->>'custom_inventory_id') is not null then
      select name into v_resolved_name
        from public.user_custom_inventory
        where id = (v_row->>'custom_inventory_id')::uuid
          and user_id = v_upload.user_id;
      if v_resolved_name is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'custom_inventory_id';
      end if;
      if public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code') then
        raise exception 'PRODUCT_MISMATCH:%:%:%',
          v_row->>'custom_inventory_id', v_row->>'product_code', v_resolved_name;
      end if;
    end if;
  end loop;

  for v_pcheck in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'product_id') is not null
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
    if v_pcheck.available < v_pcheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_pcheck.product_id, v_pcheck.need_qty, v_pcheck.available;
    end if;
  end loop;

  for v_ccheck in
    with rows as (
      select (it->>'custom_inventory_id')::uuid as custom_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'custom_inventory_id') is not null
    ),
    by_custom as (
      select custom_id, sum(quantity)::int as need_qty
      from rows group by custom_id
    )
    select bc.custom_id, bc.need_qty,
           coalesce(uci.quantity, 0) as available
    from by_custom bc
    left join public.user_custom_inventory uci
      on uci.user_id = v_upload.user_id and uci.id = bc.custom_id
  loop
    if v_ccheck.available < v_ccheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_ccheck.custom_id, v_ccheck.need_qty, v_ccheck.available;
    end if;
  end loop;

  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := nullif(v_row->>'product_id', '')::uuid;
    v_custom_id := nullif(v_row->>'custom_inventory_id', '')::uuid;

    if v_product_id is not null then
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

    elsif v_custom_id is not null then
      update public.user_custom_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and id = v_custom_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_custom_id, v_qty,
          coalesce((select quantity from public.user_custom_inventory
                    where user_id = v_upload.user_id and id = v_custom_id), 0);
      end if;
      insert into public.custom_inventory_movements
        (user_id, custom_inventory_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_custom_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    else
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;
  end loop;

  update public.order_uploads
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.approve_shipping_upload(uuid) to authenticated;

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
  v_stock_check record;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

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

  for v_stock_check in
    with input_rows as (
      select (e->>'product_id')::uuid as product_id,
             coalesce((e->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(items) as e
    )
    select p.id, p.stock, sum(ir.quantity)::int as requested_qty
    from input_rows ir
    join public.products p on p.id = ir.product_id
    group by p.id, p.stock
  loop
    if v_stock_check.stock >= 0 and v_stock_check.stock < v_stock_check.requested_qty then
      raise exception 'OUT_OF_STOCK:%', v_stock_check.id;
    end if;
  end loop;

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
