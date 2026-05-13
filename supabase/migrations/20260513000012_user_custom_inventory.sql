-- 수기 보유재고: products 카탈로그와 분리된 사용자별 임의 상품명 보유량
create table public.user_custom_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  quantity int not null default 0 check (quantity >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index user_custom_inventory_user_idx
  on public.user_custom_inventory (user_id) where quantity > 0;

alter table public.user_custom_inventory enable row level security;

-- 본인 + 관리자만 조회. initplan 최적화를 위해 (select auth.uid()) 사용.
create policy user_custom_inventory_self_select on public.user_custom_inventory
  for select using (user_id = (select auth.uid()) or public.is_admin());

-- 직접 INSERT/UPDATE 는 막음. 변경은 RPC 경유.
create policy user_custom_inventory_admin_all on public.user_custom_inventory
  for all using (public.is_admin()) with check (public.is_admin());
