-- Phase 1.3: inventory_movements — 보유 재고 변동 감사 로그

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  delta int not null check (delta <> 0),
  source_type text not null
    check (source_type in ('stock_order_approved','shipping_upload_approved','admin_adjust')),
  source_id uuid,
  created_at timestamptz not null default now()
);

create index inventory_movements_user_idx
  on public.inventory_movements (user_id, created_at desc);
create index inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc);

alter table public.inventory_movements enable row level security;

create policy inventory_movements_self_select on public.inventory_movements
  for select using (user_id = auth.uid() or public.is_admin());

create policy inventory_movements_admin_all on public.inventory_movements
  for all using (public.is_admin()) with check (public.is_admin());
