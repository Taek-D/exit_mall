-- Purchased-stock shipping uploads.
-- Adds a source discriminator to order_uploads, stores inbound-list inventory lots,
-- reserves those lots for purchased shipping uploads, and branches approval so
-- purchased shipping deducts stock lots without deducting deposit balance.

alter table public.order_uploads
  add column if not exists upload_type text not null default 'exitmall';

alter table public.order_uploads
  drop constraint if exists order_uploads_upload_type_check;

alter table public.order_uploads
  add constraint order_uploads_upload_type_check
  check (upload_type in ('exitmall', 'purchased'));

create index if not exists order_uploads_type_status_idx
  on public.order_uploads (upload_type, status, created_at desc);

-- Stash the parsed inbound items on the request itself so the admin can
-- review them alongside the attachment. Lot creation is deferred until the
-- admin actually transitions the request to `completed` (see set_inbound_status
-- below), which closes the gap where a direct RPC caller could pass a
-- different p_items array than what their uploaded spreadsheet shows.
alter table public.inbound_requests
  add column if not exists inbound_items jsonb not null default '[]'::jsonb;

create table public.purchased_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  inbound_request_id uuid not null references public.inbound_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_name text not null check (length(trim(product_name)) between 1 and 100),
  option_name text not null default '',
  row_number int not null check (row_number > 0),
  initial_quantity int not null check (initial_quantity > 0),
  remaining_quantity int not null check (remaining_quantity >= 0),
  created_at timestamptz not null default now()
);

create index purchased_inventory_lots_user_item_idx
  on public.purchased_inventory_lots (user_id, product_name, option_name, created_at, id);

create index purchased_inventory_lots_request_idx
  on public.purchased_inventory_lots (inbound_request_id);

alter table public.purchased_inventory_lots enable row level security;

create policy purchased_inventory_lots_owner_admin_select
  on public.purchased_inventory_lots
  for select using (user_id = (select auth.uid()) or public.is_admin());

create policy purchased_inventory_lots_admin_all
  on public.purchased_inventory_lots
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.purchased_inventory_lots to authenticated;

create table public.purchased_shipping_allocations (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.order_uploads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lot_id uuid not null references public.purchased_inventory_lots(id) on delete restrict,
  item_no int not null check (item_no > 0),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index purchased_shipping_allocations_upload_idx
  on public.purchased_shipping_allocations (upload_id);

create index purchased_shipping_allocations_lot_idx
  on public.purchased_shipping_allocations (lot_id);

alter table public.purchased_shipping_allocations enable row level security;

create policy purchased_shipping_allocations_owner_admin_select
  on public.purchased_shipping_allocations
  for select using (user_id = (select auth.uid()) or public.is_admin());

create policy purchased_shipping_allocations_admin_all
  on public.purchased_shipping_allocations
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.purchased_shipping_allocations to authenticated;

create or replace function public.submit_inbound_request_rpc(
  p_title text,
  p_body text,
  p_excel_path text,
  p_excel_name text,
  p_image_paths text[],
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_product_name text;
  v_quantity int;
  v_row_number int;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;

  perform public.rate_limit_check('inbound_request_create', 5, 60);

  if length(coalesce(p_title, '')) < 1 or length(p_title) > 200 then raise exception 'INVALID_TITLE'; end if;
  if length(coalesce(p_body, '')) > 5000 then raise exception 'INVALID_BODY'; end if;
  if p_image_paths is not null and cardinality(p_image_paths) > 3 then raise exception 'TOO_MANY_IMAGES'; end if;
  if p_excel_path is null or p_excel_name is null then raise exception 'MISSING_EXCEL'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_INBOUND_ITEMS';
  end if;

  -- Validate every item up-front so the admin reviews well-formed rows and
  -- so the user gets an actionable error instead of an un-completable
  -- request. Bounds mirror the check constraints on
  -- purchased_inventory_lots (product_name 1..100, quantity > 0, row > 0)
  -- so set_inbound_status('completed') can't fail on shape later.
  -- Lot rows are created in set_inbound_status when the admin transitions
  -- the request to `completed` — see comment on the inbound_items column.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_name := trim(coalesce(v_item->>'product_name', ''));
    v_quantity := coalesce((v_item->>'quantity')::int, 0);
    v_row_number := coalesce((v_item->>'row_number')::int, 0);

    if length(v_product_name) = 0 or length(v_product_name) > 100 then
      raise exception 'INVALID_INBOUND_PRODUCT';
    end if;
    if v_quantity < 1 then raise exception 'INVALID_INBOUND_QUANTITY'; end if;
    if v_row_number < 1 then raise exception 'INVALID_INBOUND_ROW'; end if;
  end loop;

  insert into public.inbound_requests (
    user_id, title, body, excel_storage_path, excel_original_name, image_paths, inbound_items
  )
  values (
    v_uid, p_title, p_body, p_excel_path, p_excel_name,
    coalesce(p_image_paths, '{}'::text[]),
    p_items
  )
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[], jsonb)
  to authenticated;

-- Backwards-compatible 5-arg overload for rolling deploys and any caller that
-- hasn't migrated to the 6-arg signature yet. Mirrors the pre-PR behavior:
-- inserts the inbound request without creating purchased_inventory_lots.
-- Delegating to the 6-arg variant would tip every legacy caller into
-- EMPTY_INBOUND_ITEMS, so this overload keeps its own self-contained body.
create or replace function public.submit_inbound_request_rpc(
  p_title text,
  p_body text,
  p_excel_path text,
  p_excel_name text,
  p_image_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;

  perform public.rate_limit_check('inbound_request_create', 5, 60);

  if length(coalesce(p_title, '')) < 1 or length(p_title) > 200 then raise exception 'INVALID_TITLE'; end if;
  if length(coalesce(p_body, '')) > 5000 then raise exception 'INVALID_BODY'; end if;
  if p_image_paths is not null and cardinality(p_image_paths) > 3 then raise exception 'TOO_MANY_IMAGES'; end if;
  if p_excel_path is null or p_excel_name is null then raise exception 'MISSING_EXCEL'; end if;

  insert into public.inbound_requests (user_id, title, body, excel_storage_path, excel_original_name, image_paths)
  values (v_uid, p_title, p_body, p_excel_path, p_excel_name, coalesce(p_image_paths, '{}'::text[]))
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[])
  to authenticated;

create or replace function public.create_purchased_shipping_upload(
  p_storage_path text,
  p_original_name text,
  p_contact_person text,
  p_buyer_phone text,
  p_request_memo text,
  p_items jsonb,
  p_total_quantity int,
  p_shipping_fee_total bigint,
  p_allocations jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_upload_id uuid;
  v_status text;
  v_expected_fee bigint;
  v_alloc jsonb;
  v_check record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_status <> 'active' then raise exception 'INACTIVE'; end if;

  -- This RPC is SECURITY DEFINER and granted to every authenticated user,
  -- so p_storage_path is untrusted. The exitmall direct-insert RLS policy
  -- (order_uploads_self_insert) enforces `storage_path like auth.uid()::text
  -- || '/%'` to prevent a caller from claiming someone else's order-uploads
  -- object — the admin download button signs the stored path with admin
  -- privileges, so a foreign path becomes an admin-side info leak. Mirror
  -- that policy here.
  if p_storage_path is null or length(trim(p_storage_path)) = 0 then
    raise exception 'MISSING_STORAGE_PATH';
  end if;
  if p_storage_path not like (v_uid::text || '/%') then
    raise exception 'FORBIDDEN_STORAGE_PATH';
  end if;
  if p_original_name is null or length(trim(p_original_name)) = 0 then
    raise exception 'MISSING_ORIGINAL_NAME';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ITEMS';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'EMPTY_ALLOCATIONS';
  end if;

  v_expected_fee := jsonb_array_length(p_items)::bigint * 3300;
  if p_shipping_fee_total <> v_expected_fee then
    raise exception 'INVALID_FEE:%:%', p_shipping_fee_total, v_expected_fee;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) it
    where coalesce((it->>'quantity')::int, 0) < 1
       or coalesce((it->>'no')::int, 0) < 1
  ) then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- Reject duplicate item_no values in p_items. Without this, a caller could
  -- submit two rows with the same `no` and the per-item allocation-sum check
  -- below would pass on both rows by reusing the same allocation, but
  -- approval would only deduct stock once — letting the upload ship more
  -- units than were reserved/deducted.
  if (
    select count(*) from jsonb_array_elements(p_items)
  ) <> (
    select count(distinct (it->>'no')::int) from jsonb_array_elements(p_items) it
  ) then
    raise exception 'DUPLICATE_ITEM_NO';
  end if;

  -- Tie p_total_quantity to the sum of item quantities so a forged
  -- p_total_quantity can't drift from what the items list actually claims.
  if p_total_quantity <> coalesce(
    (select sum((it->>'quantity')::int)::int
     from jsonb_array_elements(p_items) it),
    0
  ) then
    raise exception 'INVALID_TOTAL_QUANTITY:%:%',
      p_total_quantity,
      coalesce(
        (select sum((it->>'quantity')::int)::int
         from jsonb_array_elements(p_items) it),
        0
      );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) a
    where coalesce((a->>'quantity')::int, 0) < 1
       or coalesce((a->>'item_no')::int, 0) < 1
       or nullif(a->>'lot_id', '') is null
  ) then
    raise exception 'INVALID_ALLOCATION';
  end if;

  for v_check in
    with items as (
      select (it->>'no')::int as item_no,
             coalesce((it->>'quantity')::int, 0) as item_qty
      from jsonb_array_elements(p_items) it
    ),
    allocs as (
      select (a->>'item_no')::int as item_no,
             sum((a->>'quantity')::int)::int as alloc_qty
      from jsonb_array_elements(p_allocations) a
      group by (a->>'item_no')::int
    )
    select i.item_no, i.item_qty, coalesce(a.alloc_qty, 0) as alloc_qty
    from items i
    left join allocs a on a.item_no = i.item_no
  loop
    if v_check.item_qty <> v_check.alloc_qty then
      raise exception 'ALLOCATION_MISMATCH:%:%:%',
        v_check.item_no, v_check.item_qty, v_check.alloc_qty;
    end if;
  end loop;

  -- Verify each allocation lot's identity matches the corresponding item line.
  -- Without this, a caller can submit p_items for product A while pointing
  -- p_allocations at product B's completed lot. Approval would then deduct
  -- product B's stock while the shipping sheet still ships product A.
  for v_check in
    with item_map as (
      select (it->>'no')::int as item_no,
             coalesce(it->>'product_code', '') as expected_product,
             coalesce(it->>'product_name', '') as expected_option
      from jsonb_array_elements(p_items) it
    ),
    alloc_lots as (
      select distinct
             (a->>'item_no')::int as item_no,
             (a->>'lot_id')::uuid as lot_id
      from jsonb_array_elements(p_allocations) a
    )
    select al.item_no,
           al.lot_id,
           im.expected_product,
           im.expected_option,
           pil.product_name as lot_product,
           pil.option_name as lot_option
    from alloc_lots al
    left join item_map im on im.item_no = al.item_no
    left join public.purchased_inventory_lots pil on pil.id = al.lot_id
  loop
    if v_check.expected_product is null then
      raise exception 'ALLOCATION_ITEM_NOT_FOUND:%', v_check.item_no;
    end if;
    if v_check.lot_product is null then
      raise exception 'PURCHASED_LOT_NOT_FOUND:%', v_check.lot_id;
    end if;
    if v_check.lot_product <> v_check.expected_product
       or coalesce(v_check.lot_option, '') <> coalesce(v_check.expected_option, '') then
      raise exception 'ALLOCATION_LOT_MISMATCH:%:%:%/%',
        v_check.item_no, v_check.lot_id,
        v_check.expected_product, v_check.expected_option;
    end if;
  end loop;

  -- Serialize concurrent submissions for the same lot. Without these row
  -- locks, two transactions can both read the same pending allocations
  -- and remaining_quantity, then both insert their own allocations,
  -- "reserving" more than the lot actually has. The approval-time
  -- update only rejects one of them — by then the loser already has a
  -- stuck pending upload they can't fulfill. Locking in lot_id order
  -- keeps the lock acquisition deterministic across submissions.
  perform 1
    from public.purchased_inventory_lots pil
    where pil.id in (
      select distinct (a->>'lot_id')::uuid
      from jsonb_array_elements(p_allocations) a
    )
    order by pil.id
    for update;

  for v_check in
    with requested as (
      select (a->>'lot_id')::uuid as lot_id,
             sum((a->>'quantity')::int)::int as quantity
      from jsonb_array_elements(p_allocations) a
      group by (a->>'lot_id')::uuid
    ),
    pending as (
      select psa.lot_id, sum(psa.quantity)::int as quantity
      from public.purchased_shipping_allocations psa
      join public.order_uploads ou on ou.id = psa.upload_id
      where ou.upload_type = 'purchased'
        and ou.status = 'pending'
      group by psa.lot_id
    )
    select r.lot_id,
           r.quantity as requested,
           pil.remaining_quantity,
           coalesce(p.quantity, 0) as reserved,
           ir.status as inbound_status,
           pil.user_id
    from requested r
    left join public.purchased_inventory_lots pil on pil.id = r.lot_id
    left join public.inbound_requests ir on ir.id = pil.inbound_request_id
    left join pending p on p.lot_id = r.lot_id
  loop
    if v_check.user_id is null then raise exception 'PURCHASED_LOT_NOT_FOUND:%', v_check.lot_id; end if;
    if v_check.user_id <> v_uid then raise exception 'PURCHASED_LOT_FORBIDDEN:%', v_check.lot_id; end if;
    if v_check.inbound_status <> 'completed' then raise exception 'PURCHASED_LOT_NOT_COMPLETED:%', v_check.lot_id; end if;
    if v_check.remaining_quantity - v_check.reserved < v_check.requested then
      raise exception 'INSUFFICIENT_PURCHASED_INVENTORY:%:%:%',
        v_check.lot_id, v_check.requested, v_check.remaining_quantity - v_check.reserved;
    end if;
  end loop;

  insert into public.order_uploads (
    user_id,
    upload_type,
    storage_path,
    original_name,
    contact_person,
    buyer_phone,
    request_memo,
    items,
    total_quantity,
    total_amount,
    shipping_fee_total,
    status
  )
  values (
    v_uid,
    'purchased',
    p_storage_path,
    p_original_name,
    p_contact_person,
    p_buyer_phone,
    p_request_memo,
    p_items,
    p_total_quantity,
    0,
    p_shipping_fee_total,
    'pending'
  )
  returning id into v_upload_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.purchased_shipping_allocations
      (upload_id, user_id, lot_id, item_no, quantity)
    values
      (
        v_upload_id,
        v_uid,
        (v_alloc->>'lot_id')::uuid,
        (v_alloc->>'item_no')::int,
        (v_alloc->>'quantity')::int
      );
  end loop;

  return v_upload_id;
end; $$;

grant execute on function public.create_purchased_shipping_upload(
  text, text, text, text, text, jsonb, int, bigint, jsonb
) to authenticated;

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
      if v_resolved_name <> (v_row->>'product_code') then
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
      if v_resolved_name <> (v_row->>'product_code') then
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

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

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

  v_pending_committed := v_pending_committed + coalesce((
    select sum(shipping_fee_total)
    from public.order_uploads
    where user_id = v_user_id
      and status = 'pending'
      and coalesce(upload_type, 'exitmall') = 'exitmall'
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

revoke execute on function public.submit_inbound_request_rpc(text, text, text, text, text[], jsonb)
  from public, anon;
grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[], jsonb)
  to authenticated;

revoke execute on function public.submit_inbound_request_rpc(text, text, text, text, text[])
  from public, anon;
grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[])
  to authenticated;

revoke execute on function public.create_purchased_shipping_upload(
  text, text, text, text, text, jsonb, int, bigint, jsonb
) from public, anon;
grant execute on function public.create_purchased_shipping_upload(
  text, text, text, text, text, jsonb, int, bigint, jsonb
) to authenticated;

-- Re-define set_inbound_status so it materializes purchased_inventory_lots
-- from inbound_requests.inbound_items at the moment of admin approval. The
-- admin UI renders inbound_items alongside the attachment, so the approver
-- can verify the claimed rows match the uploaded spreadsheet before flipping
-- status to `completed`. This forecloses the prior gap where a direct RPC
-- caller could submit a benign attachment but a forged p_items array — those
-- forged rows never made it past the eyes of an admin.
create or replace function public.set_inbound_status(
  request_id uuid,
  new_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_allowed boolean := false;
  v_item jsonb;
  v_product_name text;
  v_option_name text;
  v_quantity int;
  v_row_number int;
  v_existing int;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  v_allowed := case
    when v_req.status = 'open' and new_status in ('in_progress','cancelled') then true
    when v_req.status = 'in_progress' and new_status in ('completed','cancelled') then true
    else false
  end;
  if not v_allowed then raise exception 'INVALID_TRANSITION'; end if;

  if new_status = 'completed' then
    -- Defense in depth: skip lot creation if rows already exist for this
    -- request, so accidental replays can't double-mint stock. Once a
    -- request enters `completed` the state machine never returns it here,
    -- but the guard makes the function safe under manual ops.
    select count(*) into v_existing
      from public.purchased_inventory_lots
      where inbound_request_id = request_id;

    if v_existing = 0
       and jsonb_typeof(v_req.inbound_items) = 'array'
       and jsonb_array_length(v_req.inbound_items) > 0 then
      for v_item in select * from jsonb_array_elements(v_req.inbound_items) loop
        v_product_name := trim(coalesce(v_item->>'product_name', ''));
        v_option_name := trim(coalesce(v_item->>'option_name', ''));
        v_quantity := coalesce((v_item->>'quantity')::int, 0);
        v_row_number := coalesce((v_item->>'row_number')::int, 0);

        -- Mirror the lots-table check constraint so the admin sees an
        -- actionable error instead of a raw constraint violation.
        if length(v_product_name) = 0 or length(v_product_name) > 100 then
          raise exception 'INVALID_INBOUND_PRODUCT';
        end if;
        if v_quantity < 1 then raise exception 'INVALID_INBOUND_QUANTITY'; end if;
        if v_row_number < 1 then raise exception 'INVALID_INBOUND_ROW'; end if;

        insert into public.purchased_inventory_lots
          (inbound_request_id, user_id, product_name, option_name, row_number, initial_quantity, remaining_quantity)
        values
          (request_id, v_req.user_id, v_product_name, v_option_name, v_row_number, v_quantity, v_quantity);
      end loop;
    end if;
  end if;

  update public.inbound_requests
    set status = new_status,
        reviewed_by = case when new_status in ('completed','cancelled') then v_admin else reviewed_by end,
        updated_at = now()
    where id = request_id;
end; $$;

revoke execute on function public.set_inbound_status(uuid, text) from public, anon;
grant execute on function public.set_inbound_status(uuid, text) to authenticated;

-- Re-define the column-pinning trigger so owners can never touch
-- inbound_items via direct UPDATE. Without this, an owner could submit a
-- benign spreadsheet, wait for the admin to start reviewing the still-`open`
-- row, then rewrite inbound_items so set_inbound_status('completed') mints
-- lots from the swapped JSON. The RPC bypass (`app.inbound_rpc=true`) and
-- the is_admin() escape hatch above let submit_inbound_request_rpc and
-- set_inbound_status keep writing to the column on behalf of the user.
create or replace function public.inbound_requests_pin_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return NEW; end if;
  if coalesce(current_setting('app.inbound_rpc', true), '') = 'true' then
    return NEW;
  end if;

  -- Identity / lifecycle pins (always)
  NEW.user_id := OLD.user_id;
  NEW.status := OLD.status;
  NEW.last_comment_at := OLD.last_comment_at;
  NEW.last_comment_by_role := OLD.last_comment_by_role;
  NEW.user_last_read_at := OLD.user_last_read_at;
  NEW.admin_last_read_at := OLD.admin_last_read_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.created_at := OLD.created_at;
  -- inbound_items is the canonical record of what the admin reviewed; it's
  -- only written by submit_inbound_request_rpc (via the RPC bypass), and
  -- read by set_inbound_status to materialize purchased_inventory_lots.
  NEW.inbound_items := OLD.inbound_items;

  -- excel_storage_path / excel_original_name / image_paths: allowed while
  -- the row is still 'open' (so the action layer can rename _pending_ paths
  -- to canonical paths). Storage RLS bounds the writable path to the owner's
  -- own folder, so this can't be used to point at someone else's file.
  if OLD.status <> 'open' then
    NEW.excel_storage_path := OLD.excel_storage_path;
    NEW.excel_original_name := OLD.excel_original_name;
    NEW.image_paths := OLD.image_paths;
  end if;

  return NEW;
end; $$;
