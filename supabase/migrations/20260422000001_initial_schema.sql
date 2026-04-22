-- === profiles ===
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  phone text not null,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  deposit_balance bigint not null default 0 check (deposit_balance >= 0),
  low_balance_threshold bigint not null default 10000 check (low_balance_threshold >= 0),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index profiles_status_idx on public.profiles (status);

-- Auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- === products ===
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price bigint not null check (price >= 0),
  image_url text,
  stock int not null default -1,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

-- === deposit_requests ===
create table public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount >= 1000),
  depositor_name text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  admin_memo text,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index deposit_requests_status_idx on public.deposit_requests (status, created_at desc);
create index deposit_requests_user_idx on public.deposit_requests (user_id, created_at desc);

-- === orders ===
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  total_amount bigint not null check (total_amount >= 0),
  status text not null default 'placed'
    check (status in ('placed','preparing','shipped','delivered','cancelled')),
  shipping_name text not null,
  shipping_phone text not null,
  shipping_address text not null,
  shipping_memo text,
  tracking_number text,
  carrier text,
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

-- === order_items ===
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity int not null check (quantity >= 1),
  subtotal bigint not null check (subtotal >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- === app_settings (single row id=1) ===
create table public.app_settings (
  id int primary key check (id = 1),
  bank_name text not null default '',
  bank_account_number text not null default '',
  bank_account_holder text not null default '',
  notice text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- === balance_transactions ===
create table public.balance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('deposit','order','refund','adjust')),
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  ref_type text check (ref_type in ('deposit_request','order')),
  ref_id uuid,
  admin_id uuid references public.profiles(id),
  memo text,
  created_at timestamptz not null default now()
);
create index balance_tx_user_idx on public.balance_transactions (user_id, created_at desc);

-- === Storage bucket for product images ===
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
