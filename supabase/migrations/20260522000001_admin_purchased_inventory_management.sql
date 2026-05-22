-- Admin-managed purchased inventory lots.
-- Allows admins to create and edit purchased inventory lots without an
-- inbound request while preserving an audit trail and pending-shipment
-- reservation protections.

alter table public.purchased_inventory_lots
  alter column inbound_request_id drop not null;

alter table public.purchased_inventory_lots
  add column if not exists source_type text not null default 'inbound_request'
    check (source_type in ('inbound_request','admin_manual')),
  add column if not exists admin_memo text check (length(admin_memo) <= 200),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

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
    admin_memo,
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
    v_memo,
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
        admin_memo = v_memo,
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
    v_lot.admin_memo,
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
