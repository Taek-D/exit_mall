# 엑시트몰 (폐쇄몰) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 승인 회원이 예치금을 충전하고 그 범위 내에서 상품을 주문할 수 있는 Next.js 14 + Supabase 기반 폐쇄몰을 구축한다.

**Architecture:** 단일 Next.js 14 App Router 앱에서 라우트 그룹 `(auth)` / `(user)` / `(admin)`으로 UI 분리. Supabase(Postgres + Auth + Realtime + Storage)가 백엔드. 모든 돈·재고 변경은 Postgres RPC 함수의 트랜잭션 + `SELECT ... FOR UPDATE`로 원자성 보장. RLS 정책과 미들웨어로 이중 권한 방어.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Postgres, Auth, Realtime, Storage) · Zod · Vitest · Playwright · pnpm

---

## File Structure

```
엑시트몰/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
├── components.json                     # shadcn/ui config
├── .env.local.example
├── middleware.ts                       # role/status gate
├── vitest.config.ts
├── playwright.config.ts
├── README.md
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260422000001_initial_schema.sql
│       ├── 20260422000002_rls_policies.sql
│       ├── 20260422000003_rpc_functions.sql
│       └── 20260422000004_seed_app_settings.sql
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                         # redirect home
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── pending/page.tsx
│   ├── (user)/
│   │   ├── layout.tsx
│   │   ├── shop/page.tsx
│   │   ├── cart/page.tsx
│   │   ├── checkout/page.tsx
│   │   ├── deposit/page.tsx
│   │   ├── deposit/new/page.tsx
│   │   └── orders/page.tsx
│   └── (admin)/
│       └── admin/
│           ├── layout.tsx
│           ├── page.tsx                  # dashboard
│           ├── approvals/page.tsx
│           ├── deposits/page.tsx
│           ├── products/page.tsx
│           ├── products/new/page.tsx
│           ├── products/[id]/page.tsx
│           ├── orders/page.tsx
│           ├── orders/[id]/page.tsx
│           ├── users/page.tsx
│           ├── users/[id]/page.tsx
│           ├── settings/page.tsx
│           └── low-balance/page.tsx
├── components/
│   ├── ui/                               # shadcn-generated
│   ├── NavUser.tsx
│   ├── NavAdmin.tsx
│   ├── LowBalanceBanner.tsx
│   ├── MoneyInput.tsx
│   ├── CartProvider.tsx
│   ├── OrdersRealtime.tsx
│   └── ProductImageUpload.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── browser.ts
│   │   └── middleware-client.ts
│   ├── schemas.ts                        # Zod
│   ├── money.ts
│   ├── types.ts                          # shared
│   ├── db-types.ts                       # generated
│   └── actions/
│       ├── deposit.ts
│       ├── order.ts
│       ├── admin-approvals.ts
│       ├── admin-deposits.ts
│       ├── admin-products.ts
│       ├── admin-orders.ts
│       ├── admin-users.ts
│       └── admin-settings.ts
└── tests/
    ├── unit/
    │   ├── money.test.ts
    │   └── schemas.test.ts
    ├── integration/
    │   ├── helpers.ts
    │   ├── place-order.test.ts
    │   ├── confirm-deposit.test.ts
    │   ├── cancel-order.test.ts
    │   └── rls.test.ts
    └── e2e/
        ├── deposit-flow.spec.ts
        ├── order-flow.spec.ts
        └── cancel-refund.spec.ts
```

---

## Task Overview

1. Project scaffold (Next.js + Tailwind + shadcn + pnpm)
2. Supabase local init + initial schema migration
3. RLS policies migration
4. RPC functions migration
5. Seed app_settings migration
6. Generate DB types + money utility + Zod schemas
7. Supabase client wrappers (server/browser/middleware)
8. Middleware: auth + role/status gate
9. Auth UI: signup, login, pending
10. Layouts + nav components
11. User: /shop product browsing
12. User: cart (CartProvider + /cart page)
13. User: /checkout + place_order Server Action
14. User: /deposit (list) + /deposit/new
15. User: /orders + cancel
16. LowBalanceBanner
17. Admin: layout + dashboard widgets
18. Admin: /approvals
19. Admin: /deposits
20. Admin: /products CRUD + image upload
21. Admin: /orders list + detail + transitions
22. Admin: /users + balance adjust
23. Admin: /settings
24. Admin: /low-balance
25. Realtime subscription on orders
26. E2E tests (Playwright × 3)
27. README + bootstrap guide + final checks

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.env.local.example`, `.gitignore`, `components.json`

- [ ] **Step 1: Initialize pnpm project**

Run in project root:
```bash
pnpm init
```

Edit `package.json` to this exact content:
```json
{
  "name": "exitmall",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:types": "supabase gen types typescript --local > lib/db-types.ts"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add next@14 react@18 react-dom@18 @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers clsx tailwind-merge class-variance-authority lucide-react
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer eslint eslint-config-next vitest @vitest/ui @playwright/test supabase
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};
export default nextConfig;
```

- [ ] **Step 5: Write tailwind.config.ts, postcss.config.js, globals.css**

`tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
      },
    },
  },
  plugins: [],
};
export default config;
```

`postcss.config.js`:
```javascript
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --border: 214 32% 91%;
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
}
body { @apply bg-background text-foreground; }
```

- [ ] **Step 6: Write app/layout.tsx and app/page.tsx**

`app/layout.tsx`:
```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '엑시트몰', description: '폐쇄몰' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/shop'); }
```

- [ ] **Step 7: Write .env.local.example and .gitignore**

`.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.gitignore`:
```
node_modules
.next
.env.local
.env
.DS_Store
coverage
playwright-report
test-results
supabase/.branches
supabase/.temp
```

- [ ] **Step 8: Initialize shadcn/ui**

```bash
pnpm dlx shadcn@latest init -d
```
Accept defaults. This creates `components.json` and `components/ui/`.

Then add base components we'll need:
```bash
pnpm dlx shadcn@latest add button input label card dialog form table toast badge select textarea tabs alert separator dropdown-menu
```

- [ ] **Step 9: Verify build**

```bash
pnpm typecheck
pnpm build
```
Expected: both succeed. `pnpm dev` should serve `/` redirecting to `/shop` (which will 404 — fine for now).

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js 14 + Tailwind + shadcn/ui project"
```

---

## Task 2: Supabase Local + Initial Schema Migration

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/20260422000001_initial_schema.sql`

- [ ] **Step 1: Init Supabase**

```bash
pnpm supabase init
pnpm supabase start
```
Expected: outputs `API URL`, `anon key`, `service_role key`. Copy anon/service keys into `.env.local` (create from `.env.local.example`).

- [ ] **Step 2: Create migration file**

```bash
pnpm supabase migration new initial_schema
```
This creates a timestamped file. Rename (or move contents) to `supabase/migrations/20260422000001_initial_schema.sql`.

- [ ] **Step 3: Write the initial schema**

`supabase/migrations/20260422000001_initial_schema.sql`:
```sql
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
  stock int not null default -1,  -- -1 = 무제한
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
```

- [ ] **Step 4: Apply migration**

```bash
pnpm supabase db reset
```
Expected: prints "Finished supabase db reset." and applies our migration.

- [ ] **Step 5: Verify schema**

```bash
pnpm supabase db remote commit --help  # ignore, just validate CLI works
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*"
```
Expected: lists `profiles`, `products`, `deposit_requests`, `orders`, `order_items`, `app_settings`, `balance_transactions`.

If `psql` unavailable, use Supabase Studio at `http://127.0.0.1:54323` → Table Editor.

- [ ] **Step 6: Generate DB types**

```bash
pnpm db:types
```
Expected: creates `lib/db-types.ts` with generated `Database` type.

- [ ] **Step 7: Commit**

```bash
git add supabase/ lib/db-types.ts
git commit -m "feat(db): initial schema — profiles/products/orders/balance ledger"
```

---

## Task 3: RLS Policies Migration

**Files:**
- Create: `supabase/migrations/20260422000002_rls_policies.sql`

- [ ] **Step 1: Create the migration file**

```bash
pnpm supabase migration new rls_policies
```
Rename to `20260422000002_rls_policies.sql`.

- [ ] **Step 2: Write RLS policies**

```sql
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

-- Users update only their own name/phone/threshold (not role/status/balance)
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

-- Note: regular users INSERT orders via place_order RPC (security definer), not directly.

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
```

- [ ] **Step 3: Apply and verify**

```bash
pnpm supabase db reset
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260422000002_rls_policies.sql
git commit -m "feat(db): RLS policies for profiles/products/orders/deposits/storage"
```

---

## Task 4: RPC Functions Migration

**Files:**
- Create: `supabase/migrations/20260422000003_rpc_functions.sql`

- [ ] **Step 1: Create migration**

```bash
pnpm supabase migration new rpc_functions
```
Rename to `20260422000003_rpc_functions.sql`.

- [ ] **Step 2: Write place_order RPC**

```sql
-- Places an order. Deducts balance + stock atomically. Returns order_id.
-- items: [{product_id: uuid, quantity: int}, ...]
-- shipping: {name, phone, address, memo}
create or replace function public.place_order(items jsonb, shipping jsonb)
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
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  -- Lock profile row and verify active
  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  -- Validate shipping
  if shipping->>'name' is null or length(shipping->>'name') = 0
     or shipping->>'phone' is null or length(shipping->>'phone') = 0
     or shipping->>'address' is null or length(shipping->>'address') = 0 then
    raise exception 'INVALID_SHIPPING';
  end if;

  -- Create order shell
  insert into public.orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_address, shipping_memo)
  values (v_user_id, 0, 'placed', shipping->>'name', shipping->>'phone', shipping->>'address', nullif(shipping->>'memo',''))
  returning id into v_order_id;

  -- Process each item (lock product row, validate stock, write item)
  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid for update;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    -- Decrement stock (unlimited = -1 unchanged)
    if v_product.stock >= 0 then
      update public.products set stock = stock - v_qty where id = v_product.id;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_subtotal);
  end loop;

  -- Check balance
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- Deduct balance
  update public.profiles set deposit_balance = deposit_balance - v_total where id = v_user_id;
  update public.orders set total_amount = v_total where id = v_order_id;

  -- Ledger
  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, memo)
  values (v_user_id, 'order', -v_total, v_balance - v_total, 'order', v_order_id, null);

  return v_order_id;
end; $$;

grant execute on function public.place_order(jsonb, jsonb) to authenticated;
```

- [ ] **Step 3: Write confirm_deposit / reject_deposit RPCs**

```sql
create or replace function public.confirm_deposit(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_balance bigint;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.deposit_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.deposit_requests
    set status='confirmed', confirmed_by = v_admin, confirmed_at = now()
    where id = request_id;

  update public.profiles set deposit_balance = deposit_balance + v_req.amount
    where id = v_req.user_id returning deposit_balance into v_balance;

  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id)
  values (v_req.user_id, 'deposit', v_req.amount, v_balance, 'deposit_request', v_req.id, v_admin);
end; $$;

grant execute on function public.confirm_deposit(uuid) to authenticated;

create or replace function public.reject_deposit(request_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_req from public.deposit_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.deposit_requests
    set status='rejected', admin_memo = memo, confirmed_by = auth.uid(), confirmed_at = now()
    where id = request_id;
end; $$;

grant execute on function public.reject_deposit(uuid, text) to authenticated;
```

- [ ] **Step 4: Write cancel_order RPC**

```sql
-- Cancels an order in 'placed' state (user) or any state (admin).
-- Restores balance + stock, writes refund ledger.
create or replace function public.cancel_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_admin bool := public.is_admin();
  v_order record;
  v_item record;
  v_balance bigint;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_order from public.orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;

  -- Permission: owner in placed, or admin in any non-cancelled state
  if v_admin then
    if v_order.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  else
    if v_order.user_id <> v_user then raise exception 'FORBIDDEN'; end if;
    if v_order.status <> 'placed' then raise exception 'NOT_CANCELLABLE'; end if;
  end if;

  -- Restore stock for each item where product still exists
  for v_item in select * from public.order_items where order_id = v_order.id loop
    if v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity
        where id = v_item.product_id and stock >= 0;
    end if;
  end loop;

  -- Refund balance
  update public.profiles set deposit_balance = deposit_balance + v_order.total_amount
    where id = v_order.user_id returning deposit_balance into v_balance;

  -- Mark cancelled
  update public.orders set status = 'cancelled' where id = v_order.id;

  -- Ledger
  insert into public.balance_transactions (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values (v_order.user_id, 'refund', v_order.total_amount, v_balance, 'order', v_order.id,
          case when v_admin and v_order.user_id <> v_user then v_user else null end,
          'Order cancelled');
end; $$;

grant execute on function public.cancel_order(uuid) to authenticated;
```

- [ ] **Step 5: Write adjust_balance and transition_order_status RPCs**

```sql
create or replace function public.adjust_balance(target_user uuid, delta bigint, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_new bigint;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select deposit_balance into v_balance from public.profiles where id = target_user for update;
  if v_balance is null then raise exception 'USER_NOT_FOUND'; end if;
  v_new := v_balance + delta;
  if v_new < 0 then raise exception 'NEGATIVE_BALANCE'; end if;

  update public.profiles set deposit_balance = v_new where id = target_user;
  insert into public.balance_transactions (user_id, type, amount, balance_after, admin_id, memo)
  values (target_user, 'adjust', delta, v_new, auth.uid(), memo);
end; $$;

grant execute on function public.adjust_balance(uuid, bigint, text) to authenticated;


create or replace function public.transition_order_status(
  order_id uuid, next_status text, tracking text default null, carrier_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;

  if next_status = 'preparing' and v_order.status = 'placed' then
    update public.orders set status = 'preparing' where id = order_id;
  elsif next_status = 'shipped' and v_order.status = 'preparing' then
    if tracking is null or length(tracking) = 0 or carrier_name is null or length(carrier_name) = 0 then
      raise exception 'TRACKING_REQUIRED';
    end if;
    update public.orders set status='shipped', tracking_number=tracking, carrier=carrier_name, shipped_at=now()
      where id = order_id;
  elsif next_status = 'delivered' and v_order.status = 'shipped' then
    update public.orders set status='delivered' where id = order_id;
  else
    raise exception 'INVALID_TRANSITION:% -> %', v_order.status, next_status;
  end if;
end; $$;

grant execute on function public.transition_order_status(uuid, text, text, text) to authenticated;
```

- [ ] **Step 6: Apply and verify**

```bash
pnpm supabase db reset
pnpm db:types
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260422000003_rpc_functions.sql lib/db-types.ts
git commit -m "feat(db): RPC functions for atomic order/deposit/refund flows"
```

---

## Task 5: Seed app_settings Migration

**Files:**
- Create: `supabase/migrations/20260422000004_seed_app_settings.sql`

- [ ] **Step 1: Write seed migration**

```sql
insert into public.app_settings (id, bank_name, bank_account_number, bank_account_holder, notice)
values (1, '', '', '', '이체 전 입금자명을 반드시 본인 이름으로 설정해주세요.')
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply**

```bash
pnpm supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422000004_seed_app_settings.sql
git commit -m "feat(db): seed app_settings singleton row"
```

---

## Task 6: Money Utility + Zod Schemas (TDD)

**Files:**
- Create: `lib/money.ts`, `lib/schemas.ts`, `lib/types.ts`, `tests/unit/money.test.ts`, `tests/unit/schemas.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Configure Vitest**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] **Step 2: Write failing test for money utilities**

`tests/unit/money.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatKRW, parseKRWInput } from '@/lib/money';

describe('formatKRW', () => {
  it('formats zero as ₩0', () => expect(formatKRW(0)).toBe('₩0'));
  it('adds comma separators', () => expect(formatKRW(1234567)).toBe('₩1,234,567'));
  it('handles negative values', () => expect(formatKRW(-500)).toBe('-₩500'));
});

describe('parseKRWInput', () => {
  it('parses digits only', () => expect(parseKRWInput('50000')).toBe(50000));
  it('strips commas and symbols', () => expect(parseKRWInput('₩1,234,567')).toBe(1234567));
  it('returns null for invalid input', () => expect(parseKRWInput('abc')).toBe(null));
  it('returns null for empty', () => expect(parseKRWInput('')).toBe(null));
});
```

Run: `pnpm test tests/unit/money.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement money.ts**

`lib/money.ts`:
```typescript
export function formatKRW(amount: number | bigint): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}₩${abs.toLocaleString('ko-KR')}`;
}

export function parseKRWInput(raw: string): number | null {
  const cleaned = raw.replace(/[₩,\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}
```

Run: `pnpm test tests/unit/money.test.ts`
Expected: PASS (all 7).

- [ ] **Step 4: Write types.ts**

`lib/types.ts`:
```typescript
export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type OrderStatus = 'placed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type DepositStatus = 'pending' | 'confirmed' | 'rejected';
export type BalanceTxType = 'deposit' | 'order' | 'refund' | 'adjust';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: '접수', preparing: '준비중', shipped: '배송중', delivered: '완료', cancelled: '취소',
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: '승인대기', confirmed: '반영완료', rejected: '반려',
};
```

- [ ] **Step 5: Write failing test for Zod schemas**

`tests/unit/schemas.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  signupSchema, depositRequestSchema, checkoutSchema, productSchema, adjustBalanceSchema,
} from '@/lib/schemas';

describe('signupSchema', () => {
  const valid = { email: 'a@b.com', password: 'pw123456', name: '홍길동', phone: '010-1234-5678' };
  it('passes valid', () => expect(signupSchema.safeParse(valid).success).toBe(true));
  it('rejects short password', () => expect(signupSchema.safeParse({ ...valid, password: 'pw' }).success).toBe(false));
  it('rejects invalid phone', () => expect(signupSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false));
});

describe('depositRequestSchema', () => {
  it('accepts 1000+', () => expect(depositRequestSchema.safeParse({ amount: 1000, depositorName: '홍길동' }).success).toBe(true));
  it('rejects under 1000', () => expect(depositRequestSchema.safeParse({ amount: 999, depositorName: '홍길동' }).success).toBe(false));
  it('rejects empty depositor', () => expect(depositRequestSchema.safeParse({ amount: 5000, depositorName: '' }).success).toBe(false));
});

describe('checkoutSchema', () => {
  const valid = {
    items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
    shipping: { name: '홍길동', phone: '010-1234-5678', address: '서울시 강남구 ...', memo: '' },
  };
  it('accepts valid', () => expect(checkoutSchema.safeParse(valid).success).toBe(true));
  it('rejects empty items', () =>
    expect(checkoutSchema.safeParse({ ...valid, items: [] }).success).toBe(false));
  it('rejects long address', () =>
    expect(checkoutSchema.safeParse({ ...valid, shipping: { ...valid.shipping, address: 'a'.repeat(201) } }).success).toBe(false));
});

describe('productSchema', () => {
  it('accepts -1 stock (unlimited)',
    () => expect(productSchema.safeParse({ name: 'x', description: '', price: 1000, stock: -1, isActive: true }).success).toBe(true));
  it('rejects negative price',
    () => expect(productSchema.safeParse({ name: 'x', description: '', price: -1, stock: 0, isActive: true }).success).toBe(false));
});

describe('adjustBalanceSchema', () => {
  it('accepts negative delta', () => expect(adjustBalanceSchema.safeParse({ delta: -1000, memo: '환불' }).success).toBe(true));
  it('rejects zero delta', () => expect(adjustBalanceSchema.safeParse({ delta: 0, memo: 'x' }).success).toBe(false));
  it('rejects empty memo', () => expect(adjustBalanceSchema.safeParse({ delta: 100, memo: '' }).success).toBe(false));
});
```

Run: `pnpm test tests/unit/schemas.test.ts` — FAIL.

- [ ] **Step 6: Implement schemas.ts**

`lib/schemas.ts`:
```typescript
import { z } from 'zod';

const PHONE_RX = /^01[016789]-?\d{3,4}-?\d{4}$/;

export const signupSchema = z.object({
  email: z.string().email('이메일 형식이 아닙니다'),
  password: z.string().min(8, '비밀번호는 8자 이상').max(72),
  name: z.string().min(1, '이름을 입력하세요').max(30),
  phone: z.string().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const depositRequestSchema = z.object({
  amount: z.number().int().min(1000, '1,000원 이상부터 가능합니다'),
  depositorName: z.string().min(1).max(30),
});
export type DepositRequestInput = z.infer<typeof depositRequestSchema>;

export const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).min(1, '장바구니가 비어있습니다'),
  shipping: z.object({
    name: z.string().min(1).max(30),
    phone: z.string().regex(PHONE_RX),
    address: z.string().min(1).max(200, '주소는 200자 이하'),
    memo: z.string().max(200).optional().or(z.literal('')),
  }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const productSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  price: z.number().int().min(0),
  stock: z.number().int().min(-1, '-1 또는 0 이상'),
  isActive: z.boolean(),
  imageUrl: z.string().url().optional().nullable(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const adjustBalanceSchema = z.object({
  delta: z.number().int().refine(v => v !== 0, '0이 아닌 값이어야 합니다'),
  memo: z.string().min(1, '사유를 입력하세요').max(200),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

export const appSettingsSchema = z.object({
  bankName: z.string().max(30),
  bankAccountNumber: z.string().max(50),
  bankAccountHolder: z.string().max(30),
  notice: z.string().max(1000),
});
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;

export const thresholdSchema = z.object({
  threshold: z.number().int().min(0).max(10_000_000),
});
```

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/money.ts lib/schemas.ts lib/types.ts tests/unit vitest.config.ts
git commit -m "feat(lib): money format, types, and shared Zod schemas with tests"
```

---

## Task 7: Supabase Client Wrappers

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/middleware-client.ts`

- [ ] **Step 1: Write server client**

`lib/supabase/server.ts`:
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db-types';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options: CookieOptions) => {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove: (name, options: CookieOptions) => {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 2: Write browser client**

`lib/supabase/browser.ts`:
```typescript
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db-types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Write middleware client**

`lib/supabase/middleware-client.ts`:
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/db-types';

export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options: CookieOptions) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name, options: CookieOptions) => {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );
  return { supabase, response };
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase
git commit -m "feat(lib): Supabase client wrappers for server, browser, and middleware"
```

---

## Task 8: Middleware — Auth + Role/Status Gate

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write middleware**

`middleware.ts`:
```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware-client';

const PUBLIC_PATHS = ['/login', '/signup', '/pending', '/favicon.ico'];
const USER_PATHS = ['/shop', '/cart', '/checkout', '/deposit', '/orders'];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  // Allow static/public
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/public')) return response;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Fetch profile for status/role
  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single();

  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (profile.status !== 'active') {
    const url = request.nextUrl.clone();
    url.pathname = '/pending';
    url.searchParams.set('status', profile.status);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && profile.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/shop';
    return NextResponse.redirect(url);
  }

  // Root redirect
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = profile.role === 'admin' ? '/admin' : '/shop';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): middleware enforces auth + status/role gating"
```

---

## Task 9: Auth UI — Signup, Login, Pending

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/pending/page.tsx`, `lib/actions/auth.ts`

- [ ] **Step 1: Write auth Server Actions**

`lib/actions/auth.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { signupSchema, loginSchema } from '@/lib/schemas';
import { redirect } from 'next/navigation';

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    phone: formData.get('phone'),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name, phone: parsed.data.phone } },
  });
  if (error) return { error: error.message };
  redirect('/pending?status=pending');
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: '이메일/비밀번호를 확인하세요' };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: '로그인 실패: 이메일 또는 비밀번호가 틀립니다' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '세션 오류' };

  const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).single();
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    redirect(`/pending?status=${profile?.status ?? 'pending'}`);
  }
  redirect(profile.role === 'admin' ? '/admin' : '/shop');
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
```

- [ ] **Step 2: Write /signup page**

`app/(auth)/signup/page.tsx`:
```tsx
'use client';
import { useState, useTransition } from 'react';
import { signupAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

export default function SignupPage() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await signupAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>엑시트몰 가입 신청</CardTitle></CardHeader>
        <form action={onSubmit}>
          <CardContent className="space-y-4">
            <div><Label htmlFor="email">이메일</Label><Input id="email" name="email" type="email" required /></div>
            <div><Label htmlFor="password">비밀번호 (8자 이상)</Label><Input id="password" name="password" type="password" required /></div>
            <div><Label htmlFor="name">이름</Label><Input id="name" name="name" required /></div>
            <div><Label htmlFor="phone">휴대폰 (010-1234-5678)</Label><Input id="phone" name="phone" required /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={pending}>{pending ? '처리중...' : '가입 신청'}</Button>
            <p className="text-sm text-muted-foreground">이미 계정이 있으신가요? <Link href="/login" className="underline">로그인</Link></p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write /login page**

`app/(auth)/login/page.tsx`:
```tsx
'use client';
import { useState, useTransition } from 'react';
import { loginAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

export default function LoginPage() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await loginAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>엑시트몰 로그인</CardTitle></CardHeader>
        <form action={onSubmit}>
          <CardContent className="space-y-4">
            <div><Label htmlFor="email">이메일</Label><Input id="email" name="email" type="email" required /></div>
            <div><Label htmlFor="password">비밀번호</Label><Input id="password" name="password" type="password" required /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={pending}>{pending ? '로그인중...' : '로그인'}</Button>
            <p className="text-sm text-muted-foreground">계정이 없으신가요? <Link href="/signup" className="underline">가입 신청</Link></p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Write /pending page**

`app/(auth)/pending/page.tsx`:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export default function PendingPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status ?? 'pending';
  const title = status === 'suspended' ? '계정이 정지되었습니다' : '관리자 승인 대기 중';
  const body = status === 'suspended'
    ? '운영자에게 문의해주세요.'
    : '가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.';
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>{body}</p>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="w-full">로그아웃</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Manually test**

```bash
pnpm dev
```
- Visit `/signup`, submit valid form → should redirect to `/pending`.
- Visit `/login` with wrong password → error.
- In Supabase Studio (`http://127.0.0.1:54323`), update a profile to `status='active'` and log in — should redirect to `/shop` (404 acceptable for now).

- [ ] **Step 6: Commit**

```bash
git add app/\(auth\) lib/actions/auth.ts
git commit -m "feat(auth): signup, login, pending pages + server actions"
```

---

## Task 10: Layouts + Nav Components

**Files:**
- Create: `app/(user)/layout.tsx`, `app/(admin)/admin/layout.tsx`, `components/NavUser.tsx`, `components/NavAdmin.tsx`

- [ ] **Step 1: Write NavUser component**

`components/NavUser.tsx`:
```tsx
import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';

export function NavUser({ balance, name }: { balance: number; name: string }) {
  return (
    <nav className="border-b bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/shop" className="font-bold">엑시트몰</Link>
          <Link href="/shop" className="text-sm hover:underline">상품</Link>
          <Link href="/cart" className="text-sm hover:underline">장바구니</Link>
          <Link href="/orders" className="text-sm hover:underline">주문내역</Link>
          <Link href="/deposit" className="text-sm hover:underline">예치금</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-semibold">{formatKRW(balance)}</span>
          <form action={logoutAction}><Button type="submit" variant="ghost" size="sm">로그아웃</Button></form>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Write NavAdmin component**

`components/NavAdmin.tsx`:
```tsx
import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export function NavAdmin({ name }: { name: string }) {
  return (
    <nav className="border-b bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="font-bold">엑시트몰 관리자</Link>
          <Link href="/admin" className="text-sm hover:underline">대시보드</Link>
          <Link href="/admin/approvals" className="text-sm hover:underline">가입승인</Link>
          <Link href="/admin/deposits" className="text-sm hover:underline">입금확인</Link>
          <Link href="/admin/orders" className="text-sm hover:underline">주문관리</Link>
          <Link href="/admin/products" className="text-sm hover:underline">상품관리</Link>
          <Link href="/admin/users" className="text-sm hover:underline">사용자</Link>
          <Link href="/admin/low-balance" className="text-sm hover:underline">잔액부족</Link>
          <Link href="/admin/settings" className="text-sm hover:underline">설정</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>{name}</span>
          <form action={logoutAction}><Button type="submit" variant="secondary" size="sm">로그아웃</Button></form>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Write user layout**

`app/(user)/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NavUser } from '@/components/NavUser';
import { LowBalanceBanner } from '@/components/LowBalanceBanner';
import { CartProvider } from '@/components/CartProvider';
import { Toaster } from '@/components/ui/toast';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name,deposit_balance,low_balance_threshold').eq('id', user.id).single();
  if (!profile) redirect('/login');

  return (
    <CartProvider>
      <NavUser balance={Number(profile.deposit_balance)} name={profile.name} />
      <LowBalanceBanner balance={Number(profile.deposit_balance)} threshold={Number(profile.low_balance_threshold)} />
      <main className="max-w-5xl mx-auto p-4">{children}</main>
      <Toaster />
    </CartProvider>
  );
}
```

- [ ] **Step 4: Write admin layout**

`app/(admin)/admin/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NavAdmin } from '@/components/NavAdmin';
import { Toaster } from '@/components/ui/toast';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name,role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') redirect('/shop');

  return (
    <div>
      <NavAdmin name={profile.name} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 5: Write stub LowBalanceBanner and CartProvider (real impl in later tasks)**

`components/LowBalanceBanner.tsx`:
```tsx
import { formatKRW } from '@/lib/money';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

export function LowBalanceBanner({ balance, threshold }: { balance: number; threshold: number }) {
  if (balance > threshold) return null;
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <Alert variant="destructive">
        <AlertDescription>
          잔액이 부족합니다 ({formatKRW(balance)}). <Link href="/deposit/new" className="underline">예치금 충전</Link>을 진행해주세요.
        </AlertDescription>
      </Alert>
    </div>
  );
}
```

`components/CartProvider.tsx`:
```tsx
'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartItem = { productId: string; name: string; price: number; quantity: number; imageUrl?: string | null };
type CartCtx = {
  items: CartItem[];
  add: (item: CartItem) => void;
  updateQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = 'exitmall.cart.v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const add: CartCtx['add'] = (item) => {
    setItems(prev => {
      const found = prev.find(p => p.productId === item.productId);
      if (found) return prev.map(p => p.productId === item.productId ? { ...p, quantity: p.quantity + item.quantity } : p);
      return [...prev, item];
    });
  };
  const updateQty: CartCtx['updateQty'] = (productId, qty) => {
    if (qty <= 0) return setItems(prev => prev.filter(p => p.productId !== productId));
    setItems(prev => prev.map(p => p.productId === productId ? { ...p, quantity: qty } : p));
  };
  const remove: CartCtx['remove'] = (productId) => setItems(prev => prev.filter(p => p.productId !== productId));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return <Ctx.Provider value={{ items, add, updateQty, remove, clear, total }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add app/\(user\)/layout.tsx app/\(admin\) components/
git commit -m "feat(ui): user/admin layouts, nav, cart provider, low-balance banner"
```

---

This plan is **continued in Part 2** — remaining tasks 11-27 cover user shop/cart/checkout/deposit/orders, all admin pages, realtime subscription, E2E tests, and README. Due to size, they are written in a follow-up file `docs/superpowers/plans/2026-04-22-closed-mall-part2.md` which will be generated after this foundation plan is committed and reviewed.

See Part 2 for remaining tasks.
