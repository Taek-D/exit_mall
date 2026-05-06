-- Codex P2 follow-up: per-item SELECT ... FOR UPDATE inside the loop acquires
-- locks in upload-row order. Two concurrent approvals whose uploads list the
-- same products in different orders can deadlock (txn A locks X then waits on
-- Y; txn B locks Y then waits on X) and one of them aborts with
-- `deadlock detected`.
--
-- Fix: hoist the lock acquisition out of the loop. After resolving the set of
-- matched product ids from the upload, lock them all in a single statement
-- ordered by product id ascending. PostgreSQL acquires row locks in the order
-- the rows are returned, so all approvals serialize on the same product set in
-- the same direction, eliminating the AB/BA deadlock pattern. Per-item
-- resolution then reuses the existing transaction lock without re-locking.

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
  v_resolved_stock int;
  v_already_bought int;
  v_product_name text;
  v_check record;
  v_matched_ids uuid[];
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

  -- Resolve and dedupe the set of matched product ids for this upload.
  with input_rows as (
    select coalesce(e->>'name', '(이름 없음)') as raw_name
    from jsonb_array_elements(v_upload.items) as e
  ),
  matched as (
    select p.id
    from input_rows ir
    cross join lateral (
      select id
      from public.products
      where lower(name) = lower(ir.raw_name)
        and is_active = true
      order by created_at desc, id desc
      limit 1
    ) p
  )
  select coalesce(array_agg(distinct id), '{}'::uuid[]) into v_matched_ids
  from matched;

  -- Lock all matched product rows in a single statement, ordered by id, so
  -- concurrent approvals serialize in the same direction and cannot deadlock.
  if array_length(v_matched_ids, 1) is not null then
    perform 1
      from public.products
      where id = any(v_matched_ids)
      order by id
      for update;
  end if;

  -- Pre-validate per_user_limit and stock per matched product (post-lock snapshot).
  for v_check in
    with input_rows as (
      select coalesce(e->>'name', '(이름 없음)') as raw_name,
             coalesce((e->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as e
    ),
    matched as (
      select ir.quantity, p.id as product_id, p.per_user_limit, p.stock
      from input_rows ir
      cross join lateral (
        select id, per_user_limit, stock
        from public.products
        where lower(name) = lower(ir.raw_name)
          and is_active = true
        order by created_at desc, id desc
        limit 1
      ) p
    )
    select product_id, per_user_limit, stock, sum(quantity)::int as batch_qty
    from matched
    group by product_id, per_user_limit, stock
  loop
    if v_check.per_user_limit is not null then
      select coalesce(sum(oi.quantity), 0)::int into v_already_bought
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.product_id = v_check.product_id
          and o.user_id = v_upload.user_id
          and o.status <> 'cancelled';
      if v_already_bought + v_check.batch_qty > v_check.per_user_limit then
        raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%', v_check.product_id, v_check.per_user_limit, v_already_bought;
      end if;
    end if;

    if v_check.stock >= 0 and v_check.stock < v_check.batch_qty then
      raise exception 'OUT_OF_STOCK:%:%', v_check.product_id, v_check.stock;
    end if;
  end loop;

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

    -- Already locked above; this select reuses the transaction's row lock.
    select id, stock into v_resolved_id, v_resolved_stock
      from public.products
      where lower(name) = lower(v_product_name)
        and is_active = true
      order by created_at desc, id desc
      limit 1;

    if v_resolved_id is not null then
      if v_resolved_stock >= 0 and v_resolved_stock < v_qty then
        raise exception 'OUT_OF_STOCK:%:%', v_resolved_id, v_resolved_stock;
      end if;
      if v_resolved_stock >= 0 then
        update public.products set stock = stock - v_qty where id = v_resolved_id;
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
