-- Phase 1.2: user_inventory — 사용자별·상품별 보유 재고

create table public.user_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index user_inventory_user_idx on public.user_inventory (user_id) where quantity > 0;

alter table public.user_inventory enable row level security;

create policy user_inventory_self_select on public.user_inventory
  for select using (user_id = auth.uid() or public.is_admin());

-- 직접 INSERT/UPDATE는 막음. 모든 변경은 RPC를 통해서만.
create policy user_inventory_admin_all on public.user_inventory
  for all using (public.is_admin()) with check (public.is_admin());
