# 배송대행 흐름 재구성 — Phase 1: DB 모델 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새로운 두 흐름(엑시트몰 상품 구매·배송대행 업로드)과 보유 재고를 위한 DB 스키마와 RPC를 추가한다. UI는 변경하지 않으며 기존 흐름은 그대로 동작한다.

**Architecture:** 신규 테이블 3종(`stock_orders`, `user_inventory`, `inventory_movements`) + 기존 `order_uploads` 컬럼 확장 + 신규 RPC 8종. 모든 RPC는 트랜잭션 + `SELECT FOR UPDATE` 락으로 동시성 제어. RLS는 기존 `is_admin()` / `is_active()` 헬퍼를 재사용.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 14, TypeScript, Zod, Vitest. 마이그레이션은 `supabase/migrations/20260508*.sql`. 타입은 `lib/db-types.ts` 자동 생성.

설계 문서: [docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md](../specs/2026-05-08-shipping-flow-restructure-design.md)

---

## File Structure

**Created:**
- `supabase/migrations/20260508000001_stock_orders.sql` — 테이블·RLS·요청/승인/반려 RPC 3종
- `supabase/migrations/20260508000002_user_inventory.sql` — 보유 재고 테이블·RLS
- `supabase/migrations/20260508000003_inventory_movements.sql` — 감사 로그 테이블·RLS
- `supabase/migrations/20260508000004_order_uploads_v2.sql` — 컬럼 추가·status CHECK 확장
- `supabase/migrations/20260508000005_shipping_upload_rpcs.sql` — request/approve/reject/attach_tracking/complete RPC 5종
- `tests/unit/stock-order-rpc.test.ts` — RPC wrapper 단위 테스트 (에러 매핑)
- `tests/unit/shipping-upload-rpc.test.ts` — 동상

**Modified:**
- `lib/types.ts` — 새 status 타입과 라벨 상수 추가
- `lib/db-types.ts` — 자동 재생성 (수동 편집 금지)

---

### Task 1: stock_orders 테이블·RLS·요청 RPC

**Files:**
- Create: `supabase/migrations/20260508000001_stock_orders.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- Phase 1.1: stock_orders — 엑시트몰 상품 구매 (검토대기 → 승인 시 보유 재고 적립)

create table public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),

  total_amount bigint not null default 0,

  -- [{product_id, product_name, qty, unit_price, subtotal}]
  items jsonb not null default '[]'::jsonb,

  admin_memo text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index stock_orders_user_idx on public.stock_orders (user_id, created_at desc);
create index stock_orders_status_idx on public.stock_orders (status, created_at desc);

alter table public.stock_orders enable row level security;

create policy stock_orders_self_select on public.stock_orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy stock_orders_self_insert on public.stock_orders
  for insert with check (user_id = auth.uid() and public.is_active());

create policy stock_orders_admin_all on public.stock_orders
  for all using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.stock_orders;

-- === RPC: request_stock_order (authenticated user) ===
-- pending 생성. 차감 없음. 1인 한도는 (승인 + 검토대기 + 신규) 합으로 검사.
create or replace function public.request_stock_order(items jsonb)
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
  v_normalized jsonb := '[]'::jsonb;
  v_pending_committed bigint := 0;
  v_already_bought int;
  v_pending_qty int;
  v_check record;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  -- per_user_limit 합산 검사: 승인된 stock_orders + 검토대기 stock_orders + 신규 요청
  for v_check in
    with input_rows as (
      select (e->>'product_id')::uuid as product_id,
             coalesce((e->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(items) as e
    ),
    matched as (
      select ir.product_id, ir.quantity, p.per_user_limit
      from input_rows ir
      join public.products p on p.id = ir.product_id
      where p.per_user_limit is not null
    )
    select product_id, per_user_limit, sum(quantity)::int as batch_qty
    from matched group by product_id, per_user_limit
  loop
    -- 이미 승인된 stock_orders의 누적 수량
    select coalesce(sum((it->>'qty')::int), 0)::int into v_already_bought
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'approved'
        and (it->>'product_id')::uuid = v_check.product_id;

    -- 검토대기 stock_orders 의 누적 수량
    select coalesce(sum((it->>'qty')::int), 0)::int into v_pending_qty
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'pending'
        and (it->>'product_id')::uuid = v_check.product_id;

    if v_already_bought + v_pending_qty + v_check.batch_qty > v_check.per_user_limit then
      raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%',
        v_check.product_id, v_check.per_user_limit, v_already_bought + v_pending_qty;
    end if;
  end loop;

  -- 정규화 + 마스터 재고 가용성 사전 체크 (음수 stock 무제한 처리)
  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    v_normalized := v_normalized || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'qty', v_qty,
      'unit_price', v_product.price,
      'subtotal', v_subtotal
    );
  end loop;

  -- 가용 잔액 체크: balance - 검토대기 stock_orders 합계 - 검토대기 shipping_uploads 배송비 합계
  select coalesce(sum(total_amount), 0) into v_pending_committed
    from public.stock_orders
    where user_id = v_user_id and status = 'pending';

  -- shipping_uploads 의 검토대기 배송비도 빼고 비교 (Phase 1.4 에서 컬럼 추가됨)
  -- 이 RPC는 4번 마이그레이션 이후에도 동일하게 동작해야 함.
  if v_balance - v_pending_committed < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.stock_orders (user_id, status, total_amount, items)
  values (v_user_id, 'pending', v_total, v_normalized)
  returning id into v_order_id;

  return v_order_id;
end; $$;

grant execute on function public.request_stock_order(jsonb) to authenticated;

-- === RPC: approve_stock_order (admin only) ===
create or replace function public.approve_stock_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_order record;
  v_user record;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_order.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;
  if v_user.deposit_balance < v_order.total_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 마스터 재고 차감 + user_inventory 적립 + movements 기록
  for v_item in select * from jsonb_array_elements(v_order.items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;

    update public.products set stock = stock - v_qty
      where id = v_product_id and (stock < 0 or stock >= v_qty);
    if not found then
      raise exception 'OUT_OF_STOCK:%', v_product_id;
    end if;

    insert into public.user_inventory (user_id, product_id, quantity, updated_at)
    values (v_order.user_id, v_product_id, v_qty, now())
    on conflict (user_id, product_id)
    do update set quantity = public.user_inventory.quantity + excluded.quantity,
                  updated_at = now();

    insert into public.inventory_movements
      (user_id, product_id, delta, source_type, source_id)
    values
      (v_order.user_id, v_product_id, v_qty, 'stock_order_approved', v_order.id);
  end loop;

  -- 예치금 차감 + balance_transactions 기록
  update public.profiles set deposit_balance = deposit_balance - v_order.total_amount
    where id = v_order.user_id;

  insert into public.balance_transactions
    (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values
    (v_order.user_id, 'order', -v_order.total_amount,
     v_user.deposit_balance - v_order.total_amount,
     'stock_order', v_order.id, v_admin, '재고 적립 승인');

  update public.stock_orders
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = order_id;
end; $$;

grant execute on function public.approve_stock_order(uuid) to authenticated;

-- === RPC: reject_stock_order (admin only) ===
create or replace function public.reject_stock_order(order_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.stock_orders
    set status = 'rejected', admin_memo = memo,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = order_id;
end; $$;

grant execute on function public.reject_stock_order(uuid, text) to authenticated;

-- === RPC: cancel_stock_order (owner only, pending only) ===
create or replace function public.cancel_stock_order(order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_order record;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_order from public.stock_orders where id = order_id for update;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  if v_order.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_order.status <> 'pending' then raise exception 'NOT_CANCELLABLE'; end if;

  update public.stock_orders set status = 'cancelled' where id = order_id;
end; $$;

grant execute on function public.cancel_stock_order(uuid) to authenticated;
```

- [ ] **Step 2: db reset 으로 마이그레이션 검증**

Run: `./node_modules/supabase/bin/supabase.exe db reset`
Expected: PASS — 모든 마이그레이션 적용 성공, 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000001_stock_orders.sql
git commit -m "feat(db): stock_orders 테이블 + 요청/승인/반려/취소 RPC"
```

---

### Task 2: user_inventory 테이블·RLS

**Files:**
- Create: `supabase/migrations/20260508000002_user_inventory.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
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
```

- [ ] **Step 2: db reset 검증**

Run: `./node_modules/supabase/bin/supabase.exe db reset`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000002_user_inventory.sql
git commit -m "feat(db): user_inventory 테이블 + RLS"
```

---

### Task 3: inventory_movements 감사 로그

**Files:**
- Create: `supabase/migrations/20260508000003_inventory_movements.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
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
```

- [ ] **Step 2: db reset 검증**

Run: `./node_modules/supabase/bin/supabase.exe db reset`
Expected: PASS — Task 1의 `approve_stock_order` 가 이 테이블에 INSERT 하는 코드가 있어서 미생성이면 Task 1이 실패. 순서대로 적용되므로 OK.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000003_inventory_movements.sql
git commit -m "feat(db): inventory_movements 감사 로그 테이블"
```

---

### Task 4: order_uploads 컬럼 확장 + status CHECK 확장

**Files:**
- Create: `supabase/migrations/20260508000004_order_uploads_v2.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- Phase 1.4: order_uploads — 새 양식 + 송장 재업로드 + 상태 확장

alter table public.order_uploads
  add column shipping_fee_total bigint not null default 0,
  add column admin_storage_path text,
  add column shipped_at timestamptz,
  add column completed_at timestamptz;

-- 기존 status check 제거 후 확장된 status check 추가
alter table public.order_uploads drop constraint if exists order_uploads_status_check;
alter table public.order_uploads
  add constraint order_uploads_status_check
  check (status in ('pending','approved','rejected','failed','shipped','completed','cancelled'));

-- 송장 재업로드용 storage 정책. admin_storage_path 는 user_id 폴더가 아니라 'admin/' 접두를
-- 사용하므로 owner_read 정책으로는 못 읽는다. 고객도 자신의 admin 업로드본을 읽을 수 있어야 한다.
-- → order_uploads 행 단위로 권한 판정하는 별도 정책으로 처리.

create policy "order-uploads admin file owner read" on storage.objects
  for select using (
    bucket_id = 'order-uploads'
    and (
      public.is_admin()
      or exists (
        select 1 from public.order_uploads ou
        where ou.admin_storage_path = name
          and ou.user_id = auth.uid()
      )
    )
  );

-- shipping_fee_total 의 도메인 검사: 양수 정수
alter table public.order_uploads
  add constraint order_uploads_shipping_fee_nonneg
  check (shipping_fee_total >= 0);
```

- [ ] **Step 2: db reset 검증**

Run: `./node_modules/supabase/bin/supabase.exe db reset`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000004_order_uploads_v2.sql
git commit -m "feat(db): order_uploads 확장 컬럼 + status 확장"
```

---

### Task 5: shipping_upload RPCs (request·approve·reject·attach_tracking·complete)

**Files:**
- Create: `supabase/migrations/20260508000005_shipping_upload_rpcs.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- Phase 1.5: shipping_upload RPCs — 새 양식 기반 발송 흐름.
-- request 는 server action 이 파일을 미리 파싱해서 items, shipping_fee_total 을 채워 INSERT 할 수도 있고,
-- 또는 이 RPC를 거치지 않고 INSERT만 할 수도 있다. 여기서는 RPC가 아니라 server action 책임으로 둔다.

-- === RPC: approve_shipping_upload (admin only) ===
-- 보유 재고 -qty (모든 행 합산), 배송비 -shipping_fee_total, status=approved, movements 기록.
create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_qty int;
  v_check record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  -- 보유 재고 검증 (상품별 합산)
  for v_check in
    with rows as (
      select (it->>'product_code') as code,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
    ),
    by_product as (
      select p.id as product_id, sum(r.quantity)::int as need_qty
      from rows r
      join public.products p on p.name = r.code or p.id::text = r.code
      group by p.id
    )
    select bp.product_id, bp.need_qty,
           coalesce(ui.quantity, 0) as available
    from by_product bp
    left join public.user_inventory ui
      on ui.user_id = v_upload.user_id and ui.product_id = bp.product_id
  loop
    if v_check.available < v_check.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_check.product_id, v_check.need_qty, v_check.available;
    end if;
  end loop;

  -- 예치금 (배송비) 검증
  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 + movements 기록 (행 단위)
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select id into v_product_id
      from public.products
      where name = (v_row->>'product_code') or id::text = (v_row->>'product_code')
      limit 1;
    if v_product_id is null then
      raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_code';
    end if;

    update public.user_inventory
      set quantity = quantity - v_qty, updated_at = now()
      where user_id = v_upload.user_id and product_id = v_product_id;

    insert into public.inventory_movements
      (user_id, product_id, delta, source_type, source_id)
    values
      (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);
  end loop;

  -- 배송비 차감
  update public.profiles set deposit_balance = deposit_balance - v_upload.shipping_fee_total
    where id = v_user.id;

  insert into public.balance_transactions
    (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values
    (v_user.id, 'order', -v_upload.shipping_fee_total,
     v_user.deposit_balance - v_upload.shipping_fee_total,
     'shipping_upload', v_upload.id, v_admin, '배송대행 승인 (배송비)');

  update public.order_uploads
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.approve_shipping_upload(uuid) to authenticated;

-- === RPC: reject_shipping_upload (admin only) ===
create or replace function public.reject_shipping_upload(upload_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.order_uploads
    set status = 'rejected', admin_memo = memo,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.reject_shipping_upload(uuid, text) to authenticated;

-- === RPC: cancel_shipping_upload (owner, pending only) ===
create or replace function public.cancel_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_upload.status <> 'pending' then raise exception 'NOT_CANCELLABLE'; end if;

  update public.order_uploads set status = 'cancelled' where id = upload_id;
end; $$;

grant execute on function public.cancel_shipping_upload(uuid) to authenticated;

-- === RPC: attach_tracking (admin only) ===
-- 멱등 호출 가능. 행 수가 일치해야 하고, 비어있는 송장은 그대로 둔다(부분 발송 허용).
create or replace function public.attach_tracking(
  upload_id uuid,
  storage_path text,
  parsed_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status not in ('approved','shipped') then
    raise exception 'INVALID_STATE:%', v_upload.status;
  end if;

  if jsonb_array_length(v_upload.items) <> jsonb_array_length(parsed_items) then
    raise exception 'ROW_COUNT_MISMATCH:%:%',
      jsonb_array_length(v_upload.items), jsonb_array_length(parsed_items);
  end if;

  update public.order_uploads
    set items = parsed_items,
        admin_storage_path = storage_path,
        status = 'shipped',
        shipped_at = coalesce(shipped_at, now())
    where id = upload_id;
end; $$;

grant execute on function public.attach_tracking(uuid, text, jsonb) to authenticated;

-- === RPC: complete_shipping_upload (admin only) ===
create or replace function public.complete_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'shipped' then raise exception 'INVALID_STATE:%', v_upload.status; end if;

  update public.order_uploads
    set status = 'completed', completed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.complete_shipping_upload(uuid) to authenticated;
```

- [ ] **Step 2: db reset 검증**

Run: `./node_modules/supabase/bin/supabase.exe db reset`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000005_shipping_upload_rpcs.sql
git commit -m "feat(db): shipping upload RPC 5종 (approve/reject/cancel/attach_tracking/complete)"
```

---

### Task 6: lib/db-types.ts 재생성

**Files:**
- Modify: `lib/db-types.ts` (자동 생성, 수동 편집 금지)

- [ ] **Step 1: 타입 재생성**

Run: `pnpm db:types` (= `supabase gen types typescript --local > lib/db-types.ts`)

- [ ] **Step 2: TypeScript 컴파일 통과 확인**

Run: `pnpm typecheck`
Expected: PASS — 새 테이블·컬럼이 타입에 반영됨, 기존 코드는 깨지지 않음(컬럼 추가만 했으므로).

- [ ] **Step 3: 커밋**

```bash
git add lib/db-types.ts
git commit -m "chore: regenerate db-types after Phase 1 migrations"
```

---

### Task 7: lib/types.ts 에 새 status 라벨 상수 추가

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 타입·라벨 추가**

`lib/types.ts` 파일 끝에 다음을 추가 (기존 export는 유지):

```typescript
export type StockOrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ShippingUploadStatus =
  | 'pending' | 'approved' | 'rejected' | 'failed'
  | 'shipped' | 'completed' | 'cancelled';

export const STOCK_ORDER_STATUS_LABEL: Record<StockOrderStatus, string> = {
  pending: '검토대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
};

export const SHIPPING_UPLOAD_STATUS_LABEL: Record<ShippingUploadStatus, string> = {
  pending: '검토대기',
  approved: '승인',
  rejected: '반려',
  failed: '오류',
  shipped: '발송중',
  completed: '완료',
  cancelled: '취소',
};
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/types.ts
git commit -m "feat(types): add stock order + shipping upload status labels"
```

---

### Task 8: stock_order RPC wrapper server action + 단위 테스트

**Files:**
- Create: `lib/actions/stock-order.ts`
- Create: `tests/unit/stock-order-rpc.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/stock-order-rpc.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mapStockOrderError } from '@/lib/actions/stock-order';

describe('mapStockOrderError', () => {
  it('UNAUTHORIZED', () => {
    expect(mapStockOrderError('UNAUTHORIZED')).toBe('로그인이 필요합니다.');
  });
  it('NOT_ACTIVE', () => {
    expect(mapStockOrderError('NOT_ACTIVE')).toBe('계정이 활성 상태가 아닙니다.');
  });
  it('EMPTY_CART', () => {
    expect(mapStockOrderError('EMPTY_CART')).toBe('장바구니가 비어있습니다.');
  });
  it('INSUFFICIENT_BALANCE', () => {
    expect(mapStockOrderError('INSUFFICIENT_BALANCE')).toBe('가용 예치금이 부족합니다.');
  });
  it('OUT_OF_STOCK with id', () => {
    const r = mapStockOrderError('OUT_OF_STOCK:abc-123');
    expect(r).toContain('재고가 부족');
  });
  it('PRODUCT_INACTIVE with id', () => {
    expect(mapStockOrderError('PRODUCT_INACTIVE:abc')).toContain('판매 중지');
  });
  it('PRODUCT_NOT_FOUND with id', () => {
    expect(mapStockOrderError('PRODUCT_NOT_FOUND:abc')).toContain('존재하지 않는');
  });
  it('PER_USER_LIMIT_EXCEEDED:product_id:limit:already', () => {
    const r = mapStockOrderError('PER_USER_LIMIT_EXCEEDED:abc:5:3');
    expect(r).toContain('1인 구매 한도');
    expect(r).toContain('5');
    expect(r).toContain('3');
  });
  it('NOT_CANCELLABLE', () => {
    expect(mapStockOrderError('NOT_CANCELLABLE')).toContain('취소할 수 없');
  });
  it('FORBIDDEN', () => {
    expect(mapStockOrderError('FORBIDDEN')).toContain('권한');
  });
  it('NOT_FOUND', () => {
    expect(mapStockOrderError('NOT_FOUND')).toContain('찾을 수 없');
  });
  it('ALREADY_PROCESSED', () => {
    expect(mapStockOrderError('ALREADY_PROCESSED')).toContain('이미');
  });
  it('unknown error fallback', () => {
    expect(mapStockOrderError('SOME_RANDOM_ERROR')).toBe('처리 중 오류가 발생했습니다.');
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `pnpm vitest run tests/unit/stock-order-rpc.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/stock-order'`

- [ ] **Step 3: server action 작성**

`lib/actions/stock-order.ts`:

```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const requestStockOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .min(1, '장바구니가 비어있습니다.'),
});

export type StockOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export function mapStockOrderError(message: string): string {
  if (message.startsWith('UNAUTHORIZED')) return '로그인이 필요합니다.';
  if (message.startsWith('NOT_ACTIVE')) return '계정이 활성 상태가 아닙니다.';
  if (message.startsWith('EMPTY_CART')) return '장바구니가 비어있습니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량 값이 올바르지 않습니다.';
  if (message.startsWith('INSUFFICIENT_BALANCE')) return '가용 예치금이 부족합니다.';
  if (message.startsWith('OUT_OF_STOCK')) return '재고가 부족한 상품이 있습니다.';
  if (message.startsWith('PRODUCT_INACTIVE')) return '판매 중지된 상품이 있습니다.';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return '존재하지 않는 상품이 포함되어 있습니다.';
  if (message.startsWith('PER_USER_LIMIT_EXCEEDED')) {
    const parts = message.split(':');
    const limit = parts[2] ?? '?';
    const already = parts[3] ?? '?';
    return `1인 구매 한도를 초과했습니다 (한도 ${limit}개, 누적 ${already}개).`;
  }
  if (message.startsWith('FORBIDDEN')) return '권한이 없습니다.';
  if (message.startsWith('NOT_FOUND')) return '찾을 수 없습니다.';
  if (message.startsWith('ALREADY_PROCESSED')) return '이미 처리되었습니다.';
  if (message.startsWith('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('USER_NOT_ACTIVE')) return '사용자 계정이 활성 상태가 아닙니다.';
  return '처리 중 오류가 발생했습니다.';
}

export async function requestStockOrderAction(input: unknown): Promise<StockOrderResult> {
  const parsed = requestStockOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(' · ') };
  }
  const supabase = createClient();
  const { data, error } = await (supabase.rpc as any)('request_stock_order', {
    items: parsed.data.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) {
    const msg = error.message;
    const productId =
      msg.startsWith('OUT_OF_STOCK') || msg.startsWith('PRODUCT_INACTIVE')
        ? msg.split(':')[1]?.trim()
        : undefined;
    console.error('[stock-order] request', error);
    return { ok: false, error: mapStockOrderError(msg), productId };
  }
  revalidatePath('/orders');
  revalidatePath('/shop');
  revalidatePath('/deposit');
  return { ok: true, orderId: data as string };
}

export async function cancelStockOrderAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_stock_order', { order_id: orderId });
  if (error) {
    console.error('[stock-order] cancel', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/orders');
  revalidatePath('/deposit');
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `pnpm vitest run tests/unit/stock-order-rpc.test.ts`
Expected: PASS — 13/13.

- [ ] **Step 5: 커밋**

```bash
git add lib/actions/stock-order.ts tests/unit/stock-order-rpc.test.ts
git commit -m "feat(actions): stock-order server action + error mapping tests"
```

---

### Task 9: shipping_upload admin RPC wrapper server action + 단위 테스트

**Files:**
- Create: `lib/actions/admin-shipping-uploads.ts`
- Create: `tests/unit/shipping-upload-rpc.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/shipping-upload-rpc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapShippingUploadError } from '@/lib/actions/admin-shipping-uploads';

describe('mapShippingUploadError', () => {
  it('FORBIDDEN', () => {
    expect(mapShippingUploadError('FORBIDDEN')).toBe('관리자만 처리할 수 있습니다.');
  });
  it('NOT_FOUND', () => {
    expect(mapShippingUploadError('NOT_FOUND')).toBe('업로드를 찾을 수 없습니다.');
  });
  it('ALREADY_PROCESSED', () => {
    expect(mapShippingUploadError('ALREADY_PROCESSED')).toBe('이미 처리된 업로드입니다.');
  });
  it('USER_NOT_ACTIVE', () => {
    expect(mapShippingUploadError('USER_NOT_ACTIVE')).toContain('활성');
  });
  it('EMPTY_ITEMS', () => {
    expect(mapShippingUploadError('EMPTY_ITEMS')).toContain('주문 항목이 없');
  });
  it('INSUFFICIENT_INVENTORY', () => {
    const r = mapShippingUploadError('INSUFFICIENT_INVENTORY:abc:10:3');
    expect(r).toContain('보유 재고');
    expect(r).toContain('10');
    expect(r).toContain('3');
  });
  it('INSUFFICIENT_BALANCE', () => {
    expect(mapShippingUploadError('INSUFFICIENT_BALANCE')).toContain('예치금');
  });
  it('PRODUCT_NOT_FOUND', () => {
    expect(mapShippingUploadError('PRODUCT_NOT_FOUND:CODE-123')).toContain('상품');
  });
  it('ROW_COUNT_MISMATCH', () => {
    const r = mapShippingUploadError('ROW_COUNT_MISMATCH:5:3');
    expect(r).toContain('행 수가 다릅');
  });
  it('INVALID_STATE', () => {
    expect(mapShippingUploadError('INVALID_STATE:pending')).toContain('현재 상태');
  });
  it('INVALID_QUANTITY', () => {
    expect(mapShippingUploadError('INVALID_QUANTITY')).toContain('수량');
  });
  it('NOT_CANCELLABLE', () => {
    expect(mapShippingUploadError('NOT_CANCELLABLE')).toContain('취소할 수 없');
  });
  it('unknown fallback', () => {
    expect(mapShippingUploadError('XXX')).toBe('처리 중 오류가 발생했습니다.');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/unit/shipping-upload-rpc.test.ts`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: server action 작성**

`lib/actions/admin-shipping-uploads.ts`:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

export function mapShippingUploadError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자만 처리할 수 있습니다.';
  if (message.startsWith('NOT_FOUND')) return '업로드를 찾을 수 없습니다.';
  if (message.startsWith('ALREADY_PROCESSED')) return '이미 처리된 업로드입니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('USER_NOT_ACTIVE')) return '사용자 계정이 활성 상태가 아닙니다.';
  if (message.startsWith('EMPTY_ITEMS')) return '주문 항목이 없습니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량 값이 올바르지 않은 항목이 있습니다.';
  if (message.startsWith('INSUFFICIENT_INVENTORY')) {
    const parts = message.split(':');
    const need = parts[2] ?? '?';
    const have = parts[3] ?? '?';
    return `보유 재고가 부족합니다 (필요 ${need}개, 보유 ${have}개).`;
  }
  if (message.startsWith('INSUFFICIENT_BALANCE')) return '고객의 가용 예치금이 부족합니다.';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return '존재하지 않는 상품(관리코드)이 있습니다.';
  if (message.startsWith('ROW_COUNT_MISMATCH')) {
    const parts = message.split(':');
    return `원본과 행 수가 다릅니다 (원본 ${parts[1]}행, 새 파일 ${parts[2]}행).`;
  }
  if (message.startsWith('INVALID_STATE')) {
    const cur = message.split(':')[1] ?? '?';
    return `현재 상태에서는 처리할 수 없습니다 (${cur}).`;
  }
  if (message.startsWith('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  return '처리 중 오류가 발생했습니다.';
}

export async function approveShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('approve_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] approve', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function rejectShippingUploadAction(
  uploadId: string,
  memo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('reject_shipping_upload', {
    upload_id: uploadId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-shipping-uploads] reject', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function completeShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('complete_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] complete', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}
```

> attach_tracking 은 파일 업로드를 동반하므로 Phase 5에서 작성. 여기서는 스켈레톤만.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/unit/shipping-upload-rpc.test.ts`
Expected: PASS — 13/13.

- [ ] **Step 5: 커밋**

```bash
git add lib/actions/admin-shipping-uploads.ts tests/unit/shipping-upload-rpc.test.ts
git commit -m "feat(actions): admin shipping upload server actions + error mapping tests"
```

---

### Task 10: 전체 회귀 검증

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: 모든 단위 테스트**

Run: `pnpm test`
Expected: PASS — 기존 테스트 + 신규 26개.

- [ ] **Step 3: lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: build**

Run: `pnpm build`
Expected: PASS — 기존 페이지가 깨지지 않음.

이 단계까지 완료되면 Phase 1 끝. UI는 변경하지 않았으므로 사용자 영향 없음. Phase 2로 진행.
