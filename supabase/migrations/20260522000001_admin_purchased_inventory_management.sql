-- Admin-managed purchased inventory lots.
-- Allows admins to create and edit purchased inventory lots without an
-- inbound request while preserving an audit trail and pending-shipment
-- reservation protections.

alter table public.purchased_inventory_lots
  alter column inbound_request_id drop not null;

alter table public.purchased_inventory_lots
  add column if not exists source_type text not null default 'inbound_request'
    check (source_type in ('inbound_request','admin_manual')),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

alter table public.purchased_inventory_lots
  drop constraint if exists purchased_inventory_lots_source_inbound_consistency_check;

alter table public.purchased_inventory_lots
  add constraint purchased_inventory_lots_source_inbound_consistency_check
  check (
    (source_type = 'admin_manual' and inbound_request_id is null)
    or (source_type = 'inbound_request' and inbound_request_id is not null)
  );

create index if not exists purchased_inventory_lots_user_source_idx
  on public.purchased_inventory_lots (user_id, source_type, created_at desc, id);

create table if not exists public.purchased_inventory_lot_adjustments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.purchased_inventory_lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('admin_manual_create', 'admin_update')),
  before_product_name text,
  before_option_name text,
  before_remaining_quantity int,
  before_admin_memo text,
  after_product_name text not null,
  after_option_name text not null default '',
  after_remaining_quantity int not null check (after_remaining_quantity >= 0),
  after_admin_memo text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);

create index if not exists purchased_inventory_lot_adjustments_lot_idx
  on public.purchased_inventory_lot_adjustments (lot_id, created_at desc);

create index if not exists purchased_inventory_lot_adjustments_user_idx
  on public.purchased_inventory_lot_adjustments (user_id, created_at desc);

alter table public.purchased_inventory_lot_adjustments enable row level security;

create policy purchased_inventory_lot_adjustments_admin_all
  on public.purchased_inventory_lot_adjustments
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.purchased_inventory_lot_adjustments to authenticated;

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

  if (
    select count(*) from jsonb_array_elements(p_items)
  ) <> (
    select count(distinct (it->>'no')::int) from jsonb_array_elements(p_items) it
  ) then
    raise exception 'DUPLICATE_ITEM_NO';
  end if;

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

  perform 1
    from public.purchased_inventory_lots pil
    where pil.id in (
      select distinct (a->>'lot_id')::uuid
      from jsonb_array_elements(p_allocations) a
    )
    order by pil.id
    for update;

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
           pil.source_type,
           pil.inbound_request_id,
           ir.status as inbound_status,
           pil.user_id
    from requested r
    left join public.purchased_inventory_lots pil on pil.id = r.lot_id
    left join public.inbound_requests ir on ir.id = pil.inbound_request_id
    left join pending p on p.lot_id = r.lot_id
  loop
    if v_check.user_id is null then raise exception 'PURCHASED_LOT_NOT_FOUND:%', v_check.lot_id; end if;
    if v_check.user_id <> v_uid then raise exception 'PURCHASED_LOT_FORBIDDEN:%', v_check.lot_id; end if;
    if not (
      (v_check.source_type = 'admin_manual' and v_check.inbound_request_id is null)
      or (v_check.source_type = 'inbound_request' and v_check.inbound_status = 'completed')
    ) then
      raise exception 'PURCHASED_LOT_NOT_COMPLETED:%', v_check.lot_id;
    end if;
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

revoke execute on function public.create_purchased_shipping_upload(
  text, text, text, text, text, jsonb, int, bigint, jsonb
) from public, anon;
grant execute on function public.create_purchased_shipping_upload(
  text, text, text, text, text, jsonb, int, bigint, jsonb
) to authenticated;

create or replace function public.admin_add_purchased_inventory_lot(
  target_user uuid,
  product_name text,
  option_name text,
  quantity int,
  memo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_target_user uuid := target_user;
  v_product_name text := trim(coalesce(product_name, ''));
  v_option_name text := trim(coalesce(option_name, ''));
  v_quantity int := quantity;
  v_memo text := nullif(trim(coalesce(memo, '')), '');
  v_lot_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  if v_target_user is null or not exists (
    select 1 from public.profiles p where p.id = v_target_user
  ) then
    raise exception 'USER_NOT_FOUND';
  end if;

  if length(v_product_name) < 1 or length(v_product_name) > 100 then
    raise exception 'INVALID_PRODUCT_NAME';
  end if;
  if v_quantity is null or v_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;
  if v_memo is not null and length(v_memo) > 200 then raise exception 'INVALID_MEMO'; end if;

  insert into public.purchased_inventory_lots (
    inbound_request_id,
    user_id,
    product_name,
    option_name,
    row_number,
    initial_quantity,
    remaining_quantity,
    source_type,
    updated_at,
    updated_by
  )
  values (
    null,
    v_target_user,
    v_product_name,
    v_option_name,
    1,
    v_quantity,
    v_quantity,
    'admin_manual',
    now(),
    v_admin
  )
  returning id into v_lot_id;

  insert into public.purchased_inventory_lot_adjustments (
    lot_id,
    user_id,
    action,
    before_product_name,
    before_option_name,
    before_remaining_quantity,
    before_admin_memo,
    after_product_name,
    after_option_name,
    after_remaining_quantity,
    after_admin_memo,
    created_by
  )
  values (
    v_lot_id,
    v_target_user,
    'admin_manual_create',
    null,
    null,
    null,
    null,
    v_product_name,
    v_option_name,
    v_quantity,
    v_memo,
    v_admin
  );

  return v_lot_id;
end; $$;

create or replace function public.admin_update_purchased_inventory_lot(
  target_user uuid,
  lot_id uuid,
  product_name text,
  option_name text,
  remaining_quantity int,
  memo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_target_user uuid := target_user;
  v_lot_id uuid := lot_id;
  v_product_name text := trim(coalesce(product_name, ''));
  v_option_name text := trim(coalesce(option_name, ''));
  v_remaining_quantity int := remaining_quantity;
  v_memo text := nullif(trim(coalesce(memo, '')), '');
  v_lot record;
  v_reserved int := 0;
  v_before_memo text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  if length(v_product_name) < 1 or length(v_product_name) > 100 then
    raise exception 'INVALID_PRODUCT_NAME';
  end if;
  if v_remaining_quantity is null or v_remaining_quantity < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if v_memo is not null and length(v_memo) > 200 then raise exception 'INVALID_MEMO'; end if;

  select *
    into v_lot
    from public.purchased_inventory_lots pil
    where pil.id = v_lot_id
      and pil.user_id = v_target_user
    for update;

  if v_lot is null then raise exception 'LOT_NOT_FOUND'; end if;

  select pila.after_admin_memo
    into v_before_memo
    from public.purchased_inventory_lot_adjustments pila
    where pila.lot_id = v_lot_id
    order by pila.created_at desc, pila.id desc
    limit 1;

  select coalesce(sum(psa.quantity), 0)::int
    into v_reserved
    from public.purchased_shipping_allocations psa
    join public.order_uploads ou on ou.id = psa.upload_id
    where psa.lot_id = v_lot_id
      and ou.upload_type = 'purchased'
      and ou.status = 'pending';

  if v_remaining_quantity < v_reserved then
    raise exception 'RESERVED_QUANTITY_EXCEEDED:%:%', v_remaining_quantity, v_reserved;
  end if;

  if v_reserved > 0
     and (
       v_product_name <> v_lot.product_name
       or coalesce(v_option_name, '') <> coalesce(v_lot.option_name, '')
     ) then
    raise exception 'RESERVED_IDENTITY_LOCKED:%', v_reserved;
  end if;

  update public.purchased_inventory_lots pil
    set product_name = v_product_name,
        option_name = v_option_name,
        remaining_quantity = v_remaining_quantity,
        updated_at = now(),
        updated_by = v_admin
    where pil.id = v_lot_id
      and pil.user_id = v_target_user;

  insert into public.purchased_inventory_lot_adjustments (
    lot_id,
    user_id,
    action,
    before_product_name,
    before_option_name,
    before_remaining_quantity,
    before_admin_memo,
    after_product_name,
    after_option_name,
    after_remaining_quantity,
    after_admin_memo,
    created_by
  )
  values (
    v_lot_id,
    v_target_user,
    'admin_update',
    v_lot.product_name,
    v_lot.option_name,
    v_lot.remaining_quantity,
    v_before_memo,
    v_product_name,
    v_option_name,
    v_remaining_quantity,
    v_memo,
    v_admin
  );
end; $$;

revoke execute on function public.admin_add_purchased_inventory_lot(uuid, text, text, int, text)
  from public, anon;
grant execute on function public.admin_add_purchased_inventory_lot(uuid, text, text, int, text)
  to authenticated;

revoke execute on function public.admin_update_purchased_inventory_lot(uuid, uuid, text, text, int, text)
  from public, anon;
grant execute on function public.admin_update_purchased_inventory_lot(uuid, uuid, text, text, int, text)
  to authenticated;
