-- Phase 2: Excel-based order uploads with admin approval workflow.

-- === order_uploads table ===
create table public.order_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- File metadata (stored in 'order-uploads' storage bucket)
  storage_path text not null,
  original_name text not null,

  -- Parsed header info from the Excel form
  order_date text,
  buyer_order_number text,
  company_name text,
  contact_person text,
  buyer_phone text,
  buyer_email text,
  shipping_address text,
  request_memo text,

  -- Parsed items as JSONB array of objects:
  -- [{no, brand, code, name, option, quantity, unit_price, amount, memo, shipping_request}, ...]
  items jsonb not null default '[]'::jsonb,
  total_quantity int not null default 0,
  total_amount bigint not null default 0,

  -- Workflow
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','failed')),
  admin_memo text,
  parse_error text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,

  created_at timestamptz not null default now()
);

create index order_uploads_user_idx on public.order_uploads (user_id, created_at desc);
create index order_uploads_status_idx on public.order_uploads (status, created_at desc);

-- === RLS ===
alter table public.order_uploads enable row level security;

create policy order_uploads_self_select on public.order_uploads
  for select using (user_id = auth.uid() or public.is_admin());

create policy order_uploads_self_insert on public.order_uploads
  for insert with check (user_id = auth.uid() and public.is_active());

create policy order_uploads_admin_all on public.order_uploads
  for all using (public.is_admin()) with check (public.is_admin());

-- === Storage bucket (private) ===
insert into storage.buckets (id, name, public) values ('order-uploads', 'order-uploads', false)
  on conflict (id) do nothing;

-- Owners (user folder) and admins can read/write their own files.
create policy "order-uploads owner read" on storage.objects
  for select using (
    bucket_id = 'order-uploads'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "order-uploads owner write" on storage.objects
  for insert with check (
    bucket_id = 'order-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "order-uploads admin update" on storage.objects
  for update using (bucket_id = 'order-uploads' and public.is_admin());

create policy "order-uploads admin delete" on storage.objects
  for delete using (bucket_id = 'order-uploads' and public.is_admin());

-- === RPC: approve_order_upload (admin only) ===
-- Creates a real order with order_items, deducts deposit, marks upload approved.
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
  v_balance bigint;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  -- Validate required shipping info on the upload
  if v_upload.shipping_address is null or length(v_upload.shipping_address) = 0
     or v_upload.contact_person is null or length(v_upload.contact_person) = 0
     or v_upload.buyer_phone is null or length(v_upload.buyer_phone) = 0 then
    raise exception 'MISSING_SHIPPING';
  end if;

  -- Lock the user profile and check balance
  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  -- Create the order shell
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

  -- Insert order_items from parsed JSON. product_id is null (free-form, no product master link).
  for v_item in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::bigint, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY:%', v_item; end if;
    if v_unit_price < 0 then raise exception 'INVALID_PRICE:%', v_item; end if;

    v_subtotal := v_unit_price * v_qty;
    v_total := v_total + v_subtotal;
    v_count := v_count + 1;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (
      v_order_id,
      null,
      coalesce(v_item->>'name', '(이름 없음)'),
      v_unit_price,
      v_qty,
      v_subtotal
    );
  end loop;

  if v_count = 0 then raise exception 'EMPTY_ITEMS'; end if;

  -- Check balance and deduct
  if v_user.deposit_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles set deposit_balance = deposit_balance - v_total where id = v_user.id;
  update public.orders set total_amount = v_total where id = v_order_id;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values (v_user.id, 'order', -v_total, v_user.deposit_balance - v_total, 'order', v_order_id, v_admin, '엑셀 주문 승인');

  -- Mark upload approved
  update public.order_uploads
    set status = 'approved',
        reviewed_by = v_admin,
        reviewed_at = now(),
        order_id = v_order_id
    where id = upload_id;

  return v_order_id;
end; $$;

grant execute on function public.approve_order_upload(uuid) to authenticated;

-- === RPC: reject_order_upload (admin only) ===
create or replace function public.reject_order_upload(upload_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.order_uploads
    set status = 'rejected',
        admin_memo = memo,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.reject_order_upload(uuid, text) to authenticated;

-- Realtime for admin live updates
alter publication supabase_realtime add table public.order_uploads;
