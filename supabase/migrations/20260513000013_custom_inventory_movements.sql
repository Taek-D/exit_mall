-- 수기 보유재고 변동내역 (inventory_movements 와 대칭, 다른 FK)
create table public.custom_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  custom_inventory_id uuid not null
    references public.user_custom_inventory(id) on delete cascade,
  delta int not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index cim_user_idx on public.custom_inventory_movements
  (user_id, custom_inventory_id, created_at desc);

alter table public.custom_inventory_movements enable row level security;

create policy cim_self_select on public.custom_inventory_movements
  for select using (user_id = (select auth.uid()) or public.is_admin());

create policy cim_admin_all on public.custom_inventory_movements
  for all using (public.is_admin()) with check (public.is_admin());
