-- Helper: current user is admin
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- Helper: current user is active (user or admin)
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active'
  );
$$;

-- === profiles ===
alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
    and deposit_balance = (select deposit_balance from public.profiles where id = auth.uid())
  );

-- === products ===
alter table public.products enable row level security;

create policy products_active_read on public.products
  for select using (is_active = true or public.is_admin());

create policy products_admin_all on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- === deposit_requests ===
alter table public.deposit_requests enable row level security;

create policy deposit_self_select on public.deposit_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy deposit_self_insert on public.deposit_requests
  for insert with check (user_id = auth.uid() and public.is_active());

create policy deposit_admin_update on public.deposit_requests
  for update using (public.is_admin()) with check (public.is_admin());

-- === orders ===
alter table public.orders enable row level security;

create policy orders_self_select on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

-- === order_items ===
alter table public.order_items enable row level security;

create policy order_items_self_select on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or public.is_admin()
  );

create policy order_items_admin_all on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- === balance_transactions ===
alter table public.balance_transactions enable row level security;

create policy balance_tx_self_select on public.balance_transactions
  for select using (user_id = auth.uid() or public.is_admin());

create policy balance_tx_admin_all on public.balance_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- === app_settings ===
alter table public.app_settings enable row level security;

create policy app_settings_read on public.app_settings
  for select using (true);

create policy app_settings_admin_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- === Storage: product-images bucket ===
create policy "product-images read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "product-images admin write" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin update" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());
