# 사용자 수기 보유재고 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영팀 요청을 만족하도록, `products` 카탈로그와 분리된 사용자별 "수기 보유재고" 시스템을 추가하고, 비활성 상품이 "(이름 없음)"으로 표시되는 RLS 버그를 동시에 픽스한다.

**Architecture:** 별도 테이블 `user_custom_inventory` + 별도 변동내역 테이블 `custom_inventory_movements`. 출하 매칭은 `products.name` 우선 → `user_custom_inventory.name` fallback의 2단계 lookup. 관리자 UI는 기존 `InventoryAdjuster` 카드 아래에 별도 카드로 추가. 사용자 화면은 두 데이터를 UNION으로 통합 표시하고 변동내역 라우트는 `/inventory/product/[id]` 와 `/inventory/custom/[id]` 로 분리.

**Tech Stack:** Next.js 14 (app router) · Supabase (Postgres + RLS + RPC) · Vitest · TypeScript · Tailwind · shadcn/ui

**Spec:** [docs/superpowers/specs/2026-05-13-user-custom-inventory-design.md](../specs/2026-05-13-user-custom-inventory-design.md)

---

## File Structure

### 새로 만드는 파일

| 파일 | 책임 |
|---|---|
| `supabase/migrations/20260513000001_user_custom_inventory.sql` | 신규 테이블 + RLS |
| `supabase/migrations/20260513000002_custom_inventory_movements.sql` | 변동내역 테이블 + RLS |
| `supabase/migrations/20260513000003_user_custom_inventory_rpcs.sql` | add/adjust/delete RPC 3개 |
| `supabase/migrations/20260513000004_approve_shipping_includes_custom.sql` | `approve_shipping_upload` 확장 |
| `supabase/migrations/20260513000005_products_select_owned_inventory.sql` | "(이름 없음)" 픽스 RLS |
| `lib/shipping-match.ts` | 매칭 순수 함수 (products + custom lookup) |
| `lib/errors/custom-inventory.ts` | 수기 항목 RPC 에러 메시지 매퍼 |
| `lib/actions/admin-custom-inventory.ts` | 관리자 server actions |
| `app/(admin)/admin/users/[id]/CustomInventoryManager.tsx` | 관리자 카드 UI |
| `app/(user)/inventory/custom/[id]/page.tsx` | 수기 항목 변동내역 |
| `tests/unit/shipping-match.test.ts` | 매칭 함수 유닛 |
| `tests/unit/custom-inventory-error.test.ts` | 에러 매퍼 유닛 |

### 수정하는 파일

| 파일 | 변경 |
|---|---|
| `lib/inventory.ts` | `InventoryKey` 다형성 키 + 계산 함수 시그니처 갱신 |
| `lib/actions/shipping-upload.ts` | 새 헬퍼로 위임, items에 `custom_inventory_id` 도 저장 |
| `lib/admin/user-detail.ts` | `customInventory` 필드 + 타입 추가 |
| `app/(admin)/admin/users/[id]/page.tsx` | `CustomInventoryManager` 마운트, 수기 항목도 "보유 재고" 섹션에 표시 |
| `app/(user)/inventory/page.tsx` | UNION + "수기" 배지 + 새 라우트 링크 |
| `tests/unit/inventory-calc.test.ts` | 다형성 키 시나리오 추가 |

### 이동하는 파일

| 기존 | 신규 |
|---|---|
| `app/(user)/inventory/[productId]/page.tsx` | `app/(user)/inventory/product/[id]/page.tsx` |

---

## 테스트 전략 (사전 노트)

기존 코드베이스는 **RPC 통합 테스트 인프라가 없음** — `tests/unit/shipping-upload-rpc.test.ts` 도 사실 에러 매퍼 유닛 테스트임. 본 plan은 동일 관행을 따른다.

- **유닛 테스트로 검증** : 매칭 함수(`shipping-match.ts`), 다형성 키 계산(`inventory.ts`), 에러 매퍼.
- **DB 동작은 마이그레이션 후 직접 SQL 검증** : 각 마이그레이션 task에 `psql` / Supabase SQL editor / `supabase` CLI 로 실행해 결과를 확인하는 step 포함.
- **UI 는 수동 검증** : 마지막 task의 시나리오 체크리스트로 확인.

---

## Task 1: 마이그레이션 — `user_custom_inventory` 테이블

**Files:**
- Create: `supabase/migrations/20260513000001_user_custom_inventory.sql`

- [ ] **Step 1.1: 마이그레이션 SQL 작성**

```sql
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
```

- [ ] **Step 1.2: 로컬에서 마이그레이션 적용**

```bash
npx supabase db push
```
Expected: 마이그레이션 1개 적용, 에러 없음.

- [ ] **Step 1.3: 검증 — 테이블/제약 존재 확인**

다음 SQL을 SQL editor 또는 `psql` 로 실행:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='user_custom_inventory'
order by ordinal_position;

select indexname, indexdef
from pg_indexes where schemaname='public' and tablename='user_custom_inventory';

select polname, polcmd from pg_policy
where polrelid = 'public.user_custom_inventory'::regclass;
```

Expected: 7개 컬럼, `user_custom_inventory_pkey` + `user_custom_inventory_user_id_name_key`(UNIQUE) + `user_custom_inventory_user_idx`(partial), 정책 2개(`...self_select`, `...admin_all`).

- [ ] **Step 1.4: 검증 — 음수 수량 거부**

```sql
insert into public.user_custom_inventory (user_id, name, quantity)
values ('00000000-0000-0000-0000-000000000000', 'X', -1);
```
Expected: `new row for relation "user_custom_inventory" violates check constraint`. 그 다음 잘못 시도한 트랜잭션 롤백.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/20260513000001_user_custom_inventory.sql
git commit -m "feat(inventory): user_custom_inventory table + RLS"
```

---

## Task 2: 마이그레이션 — `custom_inventory_movements` 테이블

**Files:**
- Create: `supabase/migrations/20260513000002_custom_inventory_movements.sql`

- [ ] **Step 2.1: SQL 작성**

```sql
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
```

- [ ] **Step 2.2: 마이그레이션 적용**

```bash
npx supabase db push
```
Expected: 새 마이그레이션 1개 적용.

- [ ] **Step 2.3: 검증**

```sql
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='custom_inventory_movements'
order by ordinal_position;

select polname from pg_policy
where polrelid='public.custom_inventory_movements'::regclass;
```

Expected: 7개 컬럼, 정책 2개.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/migrations/20260513000002_custom_inventory_movements.sql
git commit -m "feat(inventory): custom_inventory_movements table + RLS"
```

---

## Task 3: 마이그레이션 — 관리자 RPC 3종

**Files:**
- Create: `supabase/migrations/20260513000003_user_custom_inventory_rpcs.sql`

- [ ] **Step 3.1: SQL 작성**

```sql
-- 수기 보유재고: 추가
-- name 은 trim 후 저장. UNIQUE(user_id, name) 위반은 raise.
-- initial_qty 0 도 허용 (placeholder). 0 이 아니면 movement (admin_adjust) 한 줄 추가.
create or replace function public.add_user_custom_inventory(
  target_user uuid,
  name text,
  initial_qty int default 0,
  memo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_name text := trim(name);
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_name is null or length(v_name) = 0 or length(v_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if initial_qty is null or initial_qty < 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  insert into public.user_custom_inventory (user_id, name, quantity, created_by)
  values (target_user, v_name, initial_qty, v_admin)
  returning id into v_id;

  if initial_qty > 0 then
    insert into public.custom_inventory_movements
      (user_id, custom_inventory_id, delta, source_type, source_id)
    values
      (target_user, v_id, initial_qty, 'admin_adjust', null);
  end if;

  perform memo;
  return v_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE_NAME';
end; $$;

grant execute on function public.add_user_custom_inventory(uuid, text, int, text)
  to authenticated;

-- 수기 보유재고: 조정 (기존 adjust_user_inventory 와 동일 패턴)
create or replace function public.adjust_user_custom_inventory(
  target_user uuid,
  custom_id uuid,
  delta int,
  memo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_current int;
  v_new int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if delta = 0 then raise exception 'ZERO_DELTA'; end if;

  select quantity into v_current
    from public.user_custom_inventory uci
    where uci.id = adjust_user_custom_inventory.custom_id
      and uci.user_id = target_user
    for update;

  if v_current is null then raise exception 'NOT_FOUND'; end if;

  v_new := v_current + delta;
  if v_new < 0 then raise exception 'NEGATIVE_INVENTORY:%:%', v_current, delta; end if;

  update public.user_custom_inventory uci
    set quantity = v_new, updated_at = now()
    where uci.id = adjust_user_custom_inventory.custom_id;

  insert into public.custom_inventory_movements
    (user_id, custom_inventory_id, delta, source_type, source_id)
  values
    (target_user, adjust_user_custom_inventory.custom_id, delta, 'admin_adjust', null);

  perform v_admin;
  perform memo;
end; $$;

grant execute on function public.adjust_user_custom_inventory(uuid, uuid, int, text)
  to authenticated;

-- 수기 보유재고: 삭제 (잔량 무관 hard delete + movement 한 줄)
create or replace function public.delete_user_custom_inventory(
  target_user uuid,
  custom_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_qty int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select quantity into v_qty
    from public.user_custom_inventory uci
    where uci.id = delete_user_custom_inventory.custom_id
      and uci.user_id = target_user
    for update;
  if v_qty is null then raise exception 'NOT_FOUND'; end if;

  -- on delete cascade 로 movement 가 같이 사라지므로,
  -- audit 흔적을 다른 곳에 남길 수 없다. 별도 audit row 를 부모 삭제 전에 기록.
  -- → 부모를 삭제하기 전에 quantity 를 0 으로 만들고 movement 만 남긴 뒤 부모 삭제.
  -- (cascade 가 movement 도 함께 지움. 그래서 inventory_movements 에는 안 남고
  --  대신 같은 사용자 다른 행에 영향 없음. 본 정책은 spec 합의 "A 즉시 삭제 + 한 줄 기록" 의도)
  -- 운영팀과 합의된 절차: movement 는 cascade 로 사라져도 OK. quantity 변화 직전 기록은 남김.

  if v_qty <> 0 then
    insert into public.custom_inventory_movements
      (user_id, custom_inventory_id, delta, source_type, source_id)
    values
      (target_user, delete_user_custom_inventory.custom_id, -v_qty, 'admin_delete', null);
  end if;

  delete from public.user_custom_inventory uci
    where uci.id = delete_user_custom_inventory.custom_id;

  perform v_admin;
end; $$;

grant execute on function public.delete_user_custom_inventory(uuid, uuid)
  to authenticated;
```

> **참고**: `custom_inventory_movements.custom_inventory_id` 가 부모를 `on delete cascade` 로 참조하기 때문에, 부모를 삭제하면 movement 도 함께 사라진다. spec 의 "삭제 + movement 한 줄" 정책 이 실효성을 가지려면 cascade 를 끊거나 audit 을 다른 테이블에 남겨야 한다. 본 RPC 는 부모 삭제 직전 movement 를 기록하지만 cascade 로 정리된다 — 즉 사용자 화면 변동내역 페이지에서는 보이지 않는다. 향후 audit 이 필요해지면 `inventory_audit_log` 같은 별도 테이블을 추가하는 follow-up 으로 분리. (현 단계 YAGNI)

- [ ] **Step 3.2: 마이그레이션 적용**

```bash
npx supabase db push
```

- [ ] **Step 3.3: 검증 — 함수 시그니처**

```sql
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in (
  'add_user_custom_inventory',
  'adjust_user_custom_inventory',
  'delete_user_custom_inventory'
)
order by proname;
```
Expected: 3개 함수가 모두 출력. args 가 spec 과 일치.

- [ ] **Step 3.4: 검증 — 비-관리자 거부**

기존 일반 사용자 토큰으로 SQL editor 또는 supabase client 에서 실행:

```sql
select public.add_user_custom_inventory(
  '<some-uuid>'::uuid, '테스트', 0, null);
```
Expected: `ERROR: FORBIDDEN`.

- [ ] **Step 3.5: Commit**

```bash
git add supabase/migrations/20260513000003_user_custom_inventory_rpcs.sql
git commit -m "feat(inventory): add/adjust/delete RPCs for custom inventory"
```

---

## Task 4: 매칭 헬퍼 추출 + 유닛 테스트

기존 `shipping-upload.ts` 의 매칭 블록을 순수 함수로 추출하면 (a) 테스트 가능하고 (b) Task 5의 2단계 매칭 확장이 작은 diff 가 된다.

**Files:**
- Create: `lib/shipping-match.ts`
- Create: `tests/unit/shipping-match.test.ts`

- [ ] **Step 4.1: 테스트 먼저 작성 (RED)**

`tests/unit/shipping-match.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchInventoryRefs } from '@/lib/shipping-match';

describe('matchInventoryRefs', () => {
  const products = [
    { id: 'p-A', name: '상품A' },
    { id: 'p-B', name: '상품B' },
  ];
  const customs = [
    { id: 'c-X', name: '수기X' },
    { id: 'c-Y', name: '상품A' }, // products 와 동명 — products 우선
  ];

  it('matches names against products first', () => {
    const r = matchInventoryRefs(['상품A', '상품B'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('상품A')).toEqual({ kind: 'product', id: 'p-A' });
    expect(r.refs.get('상품B')).toEqual({ kind: 'product', id: 'p-B' });
  });

  it('falls back to custom when not in products', () => {
    const r = matchInventoryRefs(['수기X'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('수기X')).toEqual({ kind: 'custom', id: 'c-X' });
  });

  it('prefers products on name collision', () => {
    // '상품A' 는 products + customs 둘 다 존재 → products 매칭
    const r = matchInventoryRefs(['상품A'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('상품A')).toEqual({ kind: 'product', id: 'p-A' });
  });

  it('reports unknown names', () => {
    const r = matchInventoryRefs(['모름1', '상품A', '모름2'], products, customs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknown).toEqual(['모름1', '모름2']);
  });

  it('reports duplicate product names', () => {
    const r = matchInventoryRefs(
      ['상품A'],
      [
        { id: 'p-A', name: '상품A' },
        { id: 'p-A2', name: '상품A' },
      ],
      [],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['상품A']);
  });

  it('handles empty inputs', () => {
    const r = matchInventoryRefs([], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.size).toBe(0);
  });
});
```

- [ ] **Step 4.2: 테스트 실행하여 실패 확인**

```bash
npm test -- shipping-match
```
Expected: FAIL — module not found.

- [ ] **Step 4.3: 구현**

`lib/shipping-match.ts`:

```typescript
export type InventoryRef =
  | { kind: 'product'; id: string }
  | { kind: 'custom'; id: string };

export type ProductLite = { id: string; name: string };
export type CustomInventoryLite = { id: string; name: string };

export type MatchResult =
  | { ok: true; refs: Map<string, InventoryRef> }
  | { ok: false; duplicates: string[]; unknown: string[] };

export function matchInventoryRefs(
  names: string[],
  products: ProductLite[],
  customs: CustomInventoryLite[],
): MatchResult {
  const productByName = new Map<string, string>();
  const duplicates: string[] = [];
  for (const p of products) {
    if (productByName.has(p.name)) {
      if (!duplicates.includes(p.name)) duplicates.push(p.name);
    } else {
      productByName.set(p.name, p.id);
    }
  }
  if (duplicates.length > 0) {
    return { ok: false, duplicates, unknown: [] };
  }

  const customByName = new Map<string, string>();
  for (const c of customs) {
    if (!customByName.has(c.name)) customByName.set(c.name, c.id);
  }

  const refs = new Map<string, InventoryRef>();
  const unknown: string[] = [];
  const uniqueNames = Array.from(new Set(names));
  for (const name of uniqueNames) {
    const pid = productByName.get(name);
    if (pid) {
      refs.set(name, { kind: 'product', id: pid });
      continue;
    }
    const cid = customByName.get(name);
    if (cid) {
      refs.set(name, { kind: 'custom', id: cid });
      continue;
    }
    unknown.push(name);
  }
  if (unknown.length > 0) {
    return { ok: false, duplicates: [], unknown };
  }
  return { ok: true, refs };
}
```

- [ ] **Step 4.4: 테스트 통과 확인 (GREEN)**

```bash
npm test -- shipping-match
```
Expected: 6 tests pass.

- [ ] **Step 4.5: typecheck**

```bash
npm run typecheck
```
Expected: 에러 없음.

- [ ] **Step 4.6: Commit**

```bash
git add lib/shipping-match.ts tests/unit/shipping-match.test.ts
git commit -m "feat(inventory): pure matcher for 2-stage inventory lookup"
```

---

## Task 5: 마이그레이션 — `approve_shipping_upload` 확장

**Files:**
- Create: `supabase/migrations/20260513000004_approve_shipping_includes_custom.sql`

- [ ] **Step 5.1: SQL 작성**

```sql
-- approve_shipping_upload 확장:
-- items[i] 에 product_id 가 있으면 user_inventory 차감 (기존),
-- 없고 custom_inventory_id 가 있으면 user_custom_inventory 차감,
-- 둘 다 없으면 LEGACY_ITEMS_NOT_SUPPORTED.
-- 시그니처는 동일 (호출 측 변경 없음).

create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_custom_id uuid;
  v_qty int;
  v_pcheck record;
  v_ccheck record;
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

  -- legacy 감지: product_id 와 custom_inventory_id 둘 다 없는 행
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null and (it->>'custom_inventory_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 사전 검증: product 합산
  for v_pcheck in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'product_id') is not null
    ),
    by_product as (
      select product_id, sum(quantity)::int as need_qty
      from rows group by product_id
    )
    select bp.product_id, bp.need_qty,
           coalesce(ui.quantity, 0) as available
    from by_product bp
    left join public.user_inventory ui
      on ui.user_id = v_upload.user_id and ui.product_id = bp.product_id
  loop
    if v_pcheck.available < v_pcheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_pcheck.product_id, v_pcheck.need_qty, v_pcheck.available;
    end if;
  end loop;

  -- 사전 검증: custom 합산
  for v_ccheck in
    with rows as (
      select (it->>'custom_inventory_id')::uuid as custom_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'custom_inventory_id') is not null
    ),
    by_custom as (
      select custom_id, sum(quantity)::int as need_qty
      from rows group by custom_id
    )
    select bc.custom_id, bc.need_qty,
           coalesce(uci.quantity, 0) as available
    from by_custom bc
    left join public.user_custom_inventory uci
      on uci.user_id = v_upload.user_id and uci.id = bc.custom_id
  loop
    if v_ccheck.available < v_ccheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_ccheck.custom_id, v_ccheck.need_qty, v_ccheck.available;
    end if;
  end loop;

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 차감 — 행별로 product 또는 custom 분기
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := nullif(v_row->>'product_id', '')::uuid;
    v_custom_id := nullif(v_row->>'custom_inventory_id', '')::uuid;

    if v_product_id is not null then
      update public.user_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and product_id = v_product_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_product_id, v_qty,
          coalesce((select quantity from public.user_inventory
                    where user_id = v_upload.user_id and product_id = v_product_id), 0);
      end if;
      insert into public.inventory_movements
        (user_id, product_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    elsif v_custom_id is not null then
      update public.user_custom_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and id = v_custom_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_custom_id, v_qty,
          coalesce((select quantity from public.user_custom_inventory
                    where user_id = v_upload.user_id and id = v_custom_id), 0);
      end if;
      insert into public.custom_inventory_movements
        (user_id, custom_inventory_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_custom_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    else
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;
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
```

- [ ] **Step 5.2: 마이그레이션 적용**

```bash
npx supabase db push
```

- [ ] **Step 5.3: 검증 — 함수 본문 확인**

```sql
select pg_get_functiondef('public.approve_shipping_upload(uuid)'::regprocedure);
```
Expected: 새 본문에 `user_custom_inventory` 와 `custom_inventory_movements` 가 등장.

- [ ] **Step 5.4: Commit**

```bash
git add supabase/migrations/20260513000004_approve_shipping_includes_custom.sql
git commit -m "feat(inventory): approve_shipping_upload supports custom inventory items"
```

---

## Task 6: 마이그레이션 — `products` SELECT RLS 픽스

**Files:**
- Create: `supabase/migrations/20260513000005_products_select_owned_inventory.sql`

- [ ] **Step 6.1: SQL 작성**

```sql
-- "(이름 없음)" 버그 픽스:
-- 기존 products_active_read 정책이 is_active=true 만 허용해서,
-- 사용자가 보유 중인 상품이 비활성/품절되면 products(name) 조인이 null 이 된다.
-- 본인 user_inventory 와 연결된 상품은 활성 여부와 무관하게 SELECT 가능하도록 정책 추가.
-- RLS 는 PERMISSIVE 정책의 OR 합집합이므로 기존 정책은 손대지 않는다.

create policy products_select_owned_inventory on public.products
  for select using (
    exists (
      select 1 from public.user_inventory ui
      where ui.product_id = products.id
        and ui.user_id = (select auth.uid())
    )
  );
```

- [ ] **Step 6.2: 마이그레이션 적용**

```bash
npx supabase db push
```

- [ ] **Step 6.3: 검증 — 정책 등록**

```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid='public.products'::regclass
order by polname;
```
Expected: `products_select_owned_inventory` 가 추가되어 있고, using 절에 `user_inventory` 가 등장.

- [ ] **Step 6.4: 수동 검증 (사용자 토큰)**

비활성 상품 하나를 골라(`update public.products set is_active=false where id='<X>';`) 해당 상품의 `user_inventory` 를 가진 사용자로 로그인 후:

```sql
select id, name from public.products where id = '<X>';
```
Expected: 행 1개 (이름 보임). 정책 추가 전이라면 0행이었어야 함.

- [ ] **Step 6.5: Commit**

```bash
git add supabase/migrations/20260513000005_products_select_owned_inventory.sql
git commit -m "fix(inventory): show owned product names regardless of is_active"
```

---

## Task 7: `shipping-upload.ts` 액션을 새 매칭 헬퍼로 교체

기존 액션의 매칭 블록 (50–78행) 을 `matchInventoryRefs` 로 위임하고 custom 항목도 lookup 한다.

**Files:**
- Modify: `lib/actions/shipping-upload.ts`

- [ ] **Step 7.1: 매칭 블록 교체**

기존 코드 (line 45–78):

```typescript
  // 상품명(=products.name) 매칭 — 업로드 시점에 product_id 캡처해 결정적으로 고정.
  // product_code 키는 기존 order_uploads.items JSON 호환을 위해 유지한다.
  const productNames = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name')
    .in('name', productNames);
  const productList = (productRows ?? []) as Array<{ id: string; name: string }>;
  const productByName = new Map<string, string>();
  const duplicates: string[] = [];
  for (const p of productList) {
    if (productByName.has(p.name)) {
      if (!duplicates.includes(p.name)) duplicates.push(p.name);
    } else {
      productByName.set(p.name, p.id);
    }
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? ' …' : ''}`,
    };
  }
  const unknown = productNames.filter((name) => !productByName.has(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `존재하지 않는 상품명이 있습니다: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ' …' : ''}`,
    };
  }
  const itemsWithProductId = parsed.items.map((it) => ({
    ...it,
    product_id: productByName.get(it.product_code)!,
  }));
```

다음으로 교체:

```typescript
  // 2단계 매칭: products.name 우선 → user_custom_inventory.name fallback.
  // products 우선 정책 — 같은 이름이 양쪽에 있으면 항상 products 가 이긴다.
  const productNames = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const [{ data: productRows }, { data: customRows }] = await Promise.all([
    supabase.from('products').select('id, name').in('name', productNames),
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', u.user.id)
      .in('name', productNames),
  ]);

  const match = matchInventoryRefs(
    productNames,
    (productRows ?? []) as Array<{ id: string; name: string }>,
    (customRows ?? []) as Array<{ id: string; name: string }>,
  );
  if (!match.ok) {
    if (match.duplicates.length > 0) {
      const shown = match.duplicates.slice(0, 3).join(', ');
      const more = match.duplicates.length > 3 ? ' …' : '';
      return {
        ok: false,
        error: `같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): ${shown}${more}`,
      };
    }
    const shown = match.unknown.slice(0, 3).join(', ');
    const more = match.unknown.length > 3 ? ' …' : '';
    return {
      ok: false,
      error: `존재하지 않는 상품명이 있습니다: ${shown}${more}`,
    };
  }

  const itemsWithRef = parsed.items.map((it) => {
    const ref = match.refs.get(it.product_code)!;
    if (ref.kind === 'product') {
      return { ...it, product_id: ref.id };
    }
    return { ...it, custom_inventory_id: ref.id };
  });
```

그리고 `.insert({ ... items: itemsWithProductId as Json, ... })` 의 변수명을 `itemsWithRef` 로 갱신.

파일 상단 import 에 추가:

```typescript
import { matchInventoryRefs } from '@/lib/shipping-match';
```

- [ ] **Step 7.2: typecheck**

```bash
npm run typecheck
```
Expected: 에러 없음.

- [ ] **Step 7.3: 기존 유닛 테스트 회귀 확인**

```bash
npm test
```
Expected: 모든 테스트 통과 (shipping-match 포함).

- [ ] **Step 7.4: Commit**

```bash
git add lib/actions/shipping-upload.ts
git commit -m "feat(inventory): shipping upload uses 2-stage product/custom lookup"
```

---

## Task 8: `lib/inventory.ts` 다형성 키로 확장 + 테스트

**Files:**
- Modify: `lib/inventory.ts`
- Modify: `tests/unit/inventory-calc.test.ts`

- [ ] **Step 8.1: 테스트 먼저 작성 (RED)**

`tests/unit/inventory-calc.test.ts` 를 읽고 그 끝에 다음 블록을 추가:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeAvailableInventory,
  type InventoryRow,
  type PendingShippingRow,
} from '@/lib/inventory';

describe('computeAvailableInventory — polymorphic keys', () => {
  it('groups by product_id and custom_inventory_id separately', () => {
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, product_name: '상품A', quantity: 10 },
      { key: { kind: 'custom', custom_inventory_id: 'c1' }, product_name: '수기A', quantity: 5 },
    ];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, quantity: 3 },
      { key: { kind: 'custom', custom_inventory_id: 'c1' }, quantity: 2 },
    ];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(2);

    const p = rows.find((r) => r.key.kind === 'product' && r.key.product_id === 'p1')!;
    expect(p.available).toBe(7);
    expect(p.reserved).toBe(3);

    const c = rows.find((r) => r.key.kind === 'custom' && r.key.custom_inventory_id === 'c1')!;
    expect(c.available).toBe(3);
    expect(c.reserved).toBe(2);
  });

  it('does not collide product_id and custom_inventory_id with same uuid value', () => {
    const sharedId = 'shared-uuid';
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: sharedId }, product_name: 'P', quantity: 4 },
      { key: { kind: 'custom', custom_inventory_id: sharedId }, product_name: 'C', quantity: 6 },
    ];
    const pending: PendingShippingRow[] = [];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(2);
  });

  it('renders pending-only custom rows with (알 수 없는 상품)', () => {
    const inv: InventoryRow[] = [];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'custom', custom_inventory_id: 'c-missing' }, quantity: 2 },
    ];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_name).toBe('(알 수 없는 상품)');
    expect(rows[0]!.available).toBe(-2);
  });
});
```

- [ ] **Step 8.2: 테스트 실행하여 실패 확인**

```bash
npm test -- inventory-calc
```
Expected: FAIL — `InventoryRow` 가 `key` 필드를 가지지 않음.

- [ ] **Step 8.3: 구현 — `lib/inventory.ts` 전체 재작성**

```typescript
export type InventoryKey =
  | { kind: 'product'; product_id: string }
  | { kind: 'custom'; custom_inventory_id: string };

export type InventoryRow = {
  key: InventoryKey;
  product_name: string;
  quantity: number;
};

export type PendingShippingRow = {
  key: InventoryKey;
  quantity: number;
};

export type AvailableInventoryRow = {
  key: InventoryKey;
  product_name: string;
  quantity: number;
  reserved: number;
  available: number;
};

export type PendingStockOrderRow = {
  id: string;
  total_amount: number;
};

export type PendingShippingFeeRow = {
  id: string;
  shipping_fee_total: number;
};

export type AvailableDeposit = {
  balance: number;
  stockReserved: number;
  shippingReserved: number;
  available: number;
};

function keyToString(k: InventoryKey): string {
  return k.kind === 'product' ? `p:${k.product_id}` : `c:${k.custom_inventory_id}`;
}

export function computeAvailableInventory(
  inventory: InventoryRow[],
  pendingShipments: PendingShippingRow[],
): AvailableInventoryRow[] {
  const reservedByKey = new Map<string, number>();
  for (const r of pendingShipments) {
    const k = keyToString(r.key);
    reservedByKey.set(k, (reservedByKey.get(k) ?? 0) + r.quantity);
  }

  const seen = new Set<string>();
  const keyByString = new Map<string, InventoryKey>();
  for (const r of pendingShipments) keyByString.set(keyToString(r.key), r.key);

  const result: AvailableInventoryRow[] = [];
  for (const inv of inventory) {
    const k = keyToString(inv.key);
    seen.add(k);
    const reserved = reservedByKey.get(k) ?? 0;
    result.push({
      key: inv.key,
      product_name: inv.product_name,
      quantity: inv.quantity,
      reserved,
      available: inv.quantity - reserved,
    });
  }
  for (const [k, reserved] of reservedByKey) {
    if (seen.has(k)) continue;
    result.push({
      key: keyByString.get(k)!,
      product_name: '(알 수 없는 상품)',
      quantity: 0,
      reserved,
      available: -reserved,
    });
  }
  return result;
}

export function computeAvailableDeposit(
  balance: number,
  pendingStockOrders: PendingStockOrderRow[],
  pendingShippingFees: PendingShippingFeeRow[],
): AvailableDeposit {
  const stockReserved = pendingStockOrders.reduce((s, r) => s + r.total_amount, 0);
  const shippingReserved = pendingShippingFees.reduce((s, r) => s + r.shipping_fee_total, 0);
  return {
    balance,
    stockReserved,
    shippingReserved,
    available: balance - stockReserved - shippingReserved,
  };
}
```

- [ ] **Step 8.4: 테스트 통과 확인 (GREEN)**

```bash
npm test -- inventory-calc
```
Expected: 신규 3 테스트 + 기존 테스트 모두 PASS. 만약 기존 테스트가 `product_id`/`product_name` 평탄 구조를 쓰고 있다면 다음 step 에서 마이그레이션.

- [ ] **Step 8.5: 기존 inventory-calc 테스트 마이그레이션 (있다면)**

`tests/unit/inventory-calc.test.ts` 의 기존 테스트가 `{ product_id, product_name, quantity }` 같은 평탄 구조라면, 각 객체를 `{ key: { kind: 'product', product_id: '...' }, product_name: ..., quantity: ... }` 로 갱신.

`pendingShipments` 객체도 `{ product_id, quantity }` → `{ key: { kind: 'product', product_id }, quantity }` 로 갱신.

마이그레이션 후 다시 실행:

```bash
npm test -- inventory-calc
```
Expected: 전부 PASS.

- [ ] **Step 8.6: 호출 측 typecheck**

```bash
npm run typecheck
```
Expected: 컴파일 에러 — `app/(user)/inventory/page.tsx` 가 옛 시그니처를 쓰고 있어 실패할 것. 이건 Task 14 에서 갱신하므로 일단 진행. (별도 `git stash` 없이 Task 14 합쳐 마무리)

> 본 plan 의 task 들은 한 PR 내에서 순차 실행되므로 typecheck 가 끝까지 깨끗하려면 Task 14 까지 가야 한다. 중간 commit 은 정상.

- [ ] **Step 8.7: Commit**

```bash
git add lib/inventory.ts tests/unit/inventory-calc.test.ts
git commit -m "feat(inventory): polymorphic key support in compute helpers"
```

---

## Task 9: 에러 매퍼 — `lib/errors/custom-inventory.ts` + 테스트

기존 `lib/errors/shipping-upload.ts` 와 동일 패턴.

**Files:**
- Create: `lib/errors/custom-inventory.ts`
- Create: `tests/unit/custom-inventory-error.test.ts`

- [ ] **Step 9.1: 테스트 먼저 작성 (RED)**

`tests/unit/custom-inventory-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapCustomInventoryError } from '@/lib/errors/custom-inventory';

describe('mapCustomInventoryError', () => {
  it('FORBIDDEN', () => {
    expect(mapCustomInventoryError('FORBIDDEN')).toBe('관리자 권한이 필요합니다.');
  });
  it('INVALID_NAME', () => {
    expect(mapCustomInventoryError('INVALID_NAME')).toContain('상품명');
  });
  it('INVALID_QUANTITY', () => {
    expect(mapCustomInventoryError('INVALID_QUANTITY')).toContain('수량');
  });
  it('ZERO_DELTA', () => {
    expect(mapCustomInventoryError('ZERO_DELTA')).toContain('0이 아닌');
  });
  it('DUPLICATE_NAME', () => {
    expect(mapCustomInventoryError('DUPLICATE_NAME')).toContain('이미');
  });
  it('NEGATIVE_INVENTORY parses current/delta', () => {
    const r = mapCustomInventoryError('NEGATIVE_INVENTORY:5:-7');
    expect(r).toContain('5');
    expect(r).toContain('-7');
  });
  it('NOT_FOUND', () => {
    expect(mapCustomInventoryError('NOT_FOUND')).toContain('찾을 수 없');
  });
  it('unknown fallback', () => {
    expect(mapCustomInventoryError('XXX')).toBe('처리 중 오류가 발생했습니다.');
  });
});
```

- [ ] **Step 9.2: 테스트 실행하여 실패 확인**

```bash
npm test -- custom-inventory-error
```
Expected: FAIL.

- [ ] **Step 9.3: 구현**

`lib/errors/custom-inventory.ts`:

```typescript
export function mapCustomInventoryError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자 권한이 필요합니다.';
  if (message.startsWith('INVALID_NAME')) {
    return '상품명을 1–100자 사이로 입력해주세요.';
  }
  if (message.startsWith('INVALID_QUANTITY')) {
    return '수량은 0 이상의 정수여야 합니다.';
  }
  if (message.startsWith('ZERO_DELTA')) return '0이 아닌 값을 입력해주세요.';
  if (message.startsWith('DUPLICATE_NAME')) {
    return '같은 이름의 수기 항목이 이미 있습니다.';
  }
  if (message.startsWith('NEGATIVE_INVENTORY')) {
    const parts = message.split(':');
    return `잔여 재고가 부족합니다 (현재 ${parts[1]}, 적용하려는 변화 ${parts[2]}).`;
  }
  if (message.startsWith('NOT_FOUND')) return '항목을 찾을 수 없습니다.';
  return '처리 중 오류가 발생했습니다.';
}
```

- [ ] **Step 9.4: 테스트 통과 확인 (GREEN)**

```bash
npm test -- custom-inventory-error
```
Expected: 8 tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add lib/errors/custom-inventory.ts tests/unit/custom-inventory-error.test.ts
git commit -m "feat(inventory): error mapper for custom inventory RPCs"
```

---

## Task 10: 관리자 server actions

**Files:**
- Create: `lib/actions/admin-custom-inventory.ts`

- [ ] **Step 10.1: 액션 작성**

```typescript
'use server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapCustomInventoryError } from '@/lib/errors/custom-inventory';

const addSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1, '상품명을 입력해주세요.').max(100, '상품명은 100자 이내여야 합니다.'),
  quantity: z.number().int().min(0, '수량은 0 이상이어야 합니다.'),
  memo: z.string().max(200).optional(),
});

const adjustSchema = z.object({
  userId: z.string().uuid(),
  customInventoryId: z.string().uuid(),
  delta: z.number().int().refine((v) => v !== 0, '0이 아닌 정수여야 합니다.'),
  memo: z.string().max(200).optional(),
});

const deleteSchema = z.object({
  userId: z.string().uuid(),
  customInventoryId: z.string().uuid(),
});

function revalidateUser(userId: string) {
  revalidatePaths([`/admin/users/${userId}`, '/inventory']);
}

export async function addCustomInventoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await callRpc(guard.supabase, 'add_user_custom_inventory', {
    target_user: parsed.data.userId,
    name: parsed.data.name,
    initial_qty: parsed.data.quantity,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    console.error('[admin-custom-inventory] add', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true, id: data as string };
}

export async function adjustCustomInventoryAction(input: unknown): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'adjust_user_custom_inventory', {
    target_user: parsed.data.userId,
    custom_id: parsed.data.customInventoryId,
    delta: parsed.data.delta,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    console.error('[admin-custom-inventory] adjust', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true };
}

export async function deleteCustomInventoryAction(input: unknown): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'delete_user_custom_inventory', {
    target_user: parsed.data.userId,
    custom_id: parsed.data.customInventoryId,
  });
  if (error) {
    console.error('[admin-custom-inventory] delete', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true };
}
```

- [ ] **Step 10.2: typecheck**

```bash
npm run typecheck
```
Expected: 이 파일은 깨끗. (다른 미수정 호출 측은 후속 task 에서.)

- [ ] **Step 10.3: Commit**

```bash
git add lib/actions/admin-custom-inventory.ts
git commit -m "feat(inventory): admin server actions for custom inventory"
```

---

## Task 11: `CustomInventoryManager` 컴포넌트

**Files:**
- Create: `app/(admin)/admin/users/[id]/CustomInventoryManager.tsx`

- [ ] **Step 11.1: 컴포넌트 작성**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  addCustomInventoryAction,
  adjustCustomInventoryAction,
  deleteCustomInventoryAction,
} from '@/lib/actions/admin-custom-inventory';

export type CustomInventoryRow = {
  id: string;
  name: string;
  quantity: number;
  updated_at: string;
};

export function CustomInventoryManager({
  userId,
  rows,
}: {
  userId: string;
  rows: CustomInventoryRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [initQty, setInitQty] = useState<number>(0);
  const [memo, setMemo] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  const [editing, setEditing] = useState<Record<string, { delta: number; memo: string }>>({});
  const [rowErr, setRowErr] = useState<Record<string, string | null>>({});
  const [adjusting, startAdjust] = useTransition();
  const [deleting, startDelete] = useTransition();

  const onAdd = () =>
    startAdd(async () => {
      setAddErr(null);
      const r = await addCustomInventoryAction({
        userId,
        name: name.trim(),
        quantity: Number.isFinite(initQty) ? initQty : 0,
        memo,
      });
      if (!r.ok) {
        setAddErr(r.error ?? '실패');
        return;
      }
      toast({ title: '수기 항목 추가됨' });
      setName('');
      setInitQty(0);
      setMemo('');
      router.refresh();
    });

  const onAdjust = (id: string) =>
    startAdjust(async () => {
      setRowErr((m) => ({ ...m, [id]: null }));
      const state = editing[id] ?? { delta: 0, memo: '' };
      if (state.delta === 0) {
        setRowErr((m) => ({ ...m, [id]: '0이 아닌 값을 입력해주세요.' }));
        return;
      }
      const r = await adjustCustomInventoryAction({
        userId,
        customInventoryId: id,
        delta: state.delta,
        memo: state.memo,
      });
      if (!r.ok) {
        setRowErr((m) => ({ ...m, [id]: r.error ?? '실패' }));
        return;
      }
      toast({ title: '조정 완료' });
      setEditing((m) => ({ ...m, [id]: { delta: 0, memo: '' } }));
      router.refresh();
    });

  const onDelete = (id: string, currentQty: number, nm: string) =>
    startDelete(async () => {
      const msg =
        currentQty > 0
          ? `"${nm}" 항목을 삭제할까요? 현재 ${currentQty}개가 손실 처리됩니다.`
          : `"${nm}" 항목을 삭제할까요?`;
      if (!window.confirm(msg)) return;
      const r = await deleteCustomInventoryAction({ userId, customInventoryId: id });
      if (!r.ok) {
        setRowErr((m) => ({ ...m, [id]: r.error ?? '실패' }));
        return;
      }
      toast({ title: '삭제 완료' });
      router.refresh();
    });

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-medium">수기 보유 재고</h3>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">새 수기 항목 추가</p>
        <div className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
          <Input placeholder="상품명" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="number"
            placeholder="초기 수량"
            value={Number.isFinite(initQty) ? initQty : 0}
            onChange={(e) => setInitQty(parseInt(e.target.value, 10) || 0)}
          />
          <Input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <Button disabled={adding || name.trim().length === 0} onClick={onAdd}>
            {adding ? '추가 중…' : '추가'}
          </Button>
        </div>
        {addErr && <p className="text-sm text-destructive">{addErr}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">현재 수기 항목</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 수기 항목이 없습니다.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => {
              const e = editing[row.id] ?? { delta: 0, memo: '' };
              const err = rowErr[row.id];
              return (
                <li
                  key={row.id}
                  className={`p-3 grid grid-cols-[1fr_80px_120px_1fr_auto_auto] gap-2 items-center ${
                    row.quantity === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <span className="text-sm truncate">{row.name}</span>
                  <span className="font-mono tabular text-right">보유 {row.quantity}</span>
                  <Input
                    type="number"
                    placeholder="±"
                    value={Number.isFinite(e.delta) ? e.delta : 0}
                    onChange={(ev) =>
                      setEditing((m) => ({
                        ...m,
                        [row.id]: { ...e, delta: parseInt(ev.target.value, 10) || 0 },
                      }))
                    }
                  />
                  <Input
                    placeholder="메모"
                    value={e.memo}
                    onChange={(ev) =>
                      setEditing((m) => ({ ...m, [row.id]: { ...e, memo: ev.target.value } }))
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={adjusting || e.delta === 0}
                    onClick={() => onAdjust(row.id)}
                  >
                    조정
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => onDelete(row.id, row.quantity, row.name)}
                  >
                    삭제
                  </Button>
                  {err && (
                    <p className="col-span-6 text-xs text-destructive">{err}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: typecheck**

```bash
npm run typecheck
```
Expected: 이 파일은 깨끗. (`Button`/`Input`/`useToast` 가 기존 프로젝트에 존재 — `InventoryAdjuster.tsx` 참고.)

- [ ] **Step 11.3: Commit**

```bash
git add app/\(admin\)/admin/users/\[id\]/CustomInventoryManager.tsx
git commit -m "feat(inventory): admin CustomInventoryManager UI"
```

---

## Task 12: `fetchAdminUserDetail` 확장

**Files:**
- Modify: `lib/admin/user-detail.ts`

- [ ] **Step 12.1: 타입 추가**

기존 export 들 사이에 `AdminUserCustomInventoryRow` 타입 추가:

```typescript
export type AdminUserCustomInventoryRow = {
  id: string;
  name: string;
  quantity: number;
  updated_at: string;
};
```

`AdminUserDetail` 타입에 필드 추가:

```typescript
export type AdminUserDetail = {
  profile: AdminUserProfile;
  orders: AdminUserUnifiedOrder[];
  deposits: AdminUserDeposit[];
  transactions: AdminUserBalanceTx[];
  inventory: AdminUserInventoryRow[];
  customInventory: AdminUserCustomInventoryRow[];  // 추가
  products: AdminUserProductOption[];
  totalSpent: number;
};
```

- [ ] **Step 12.2: Promise.all 에 fetch 추가**

`fetchAdminUserDetail` 의 `Promise.all([...])` 배열에 다음 항목을 추가 (`{ data: products }` 다음 위치):

```typescript
supabase
  .from('user_custom_inventory')
  .select('id, name, quantity, updated_at')
  .eq('user_id', userId)
  .order('updated_at', { ascending: false }),
```

destructure 도 갱신:

```typescript
const [
  { data: profile },
  { data: stockOrders },
  { data: shippingUploads },
  { data: legacyOrders },
  { data: deposits },
  { data: transactions },
  { data: inventory },
  { data: products },
  { data: customInventory },   // 추가
] = await Promise.all([ ... ]);
```

return 객체에 추가:

```typescript
return {
  profile,
  orders: merged,
  deposits: (deposits ?? []) as unknown as AdminUserDeposit[],
  transactions: (transactions ?? []) as unknown as AdminUserBalanceTx[],
  inventory: (inventory ?? []) as unknown as AdminUserInventoryRow[],
  customInventory: (customInventory ?? []) as unknown as AdminUserCustomInventoryRow[],
  products: (products ?? []) as unknown as AdminUserProductOption[],
  totalSpent,
};
```

- [ ] **Step 12.3: typecheck**

```bash
npm run typecheck
```
Expected: 이 파일은 깨끗. (page.tsx 의 destructure 가 깨질 수 있음 → Task 13 에서 갱신.)

- [ ] **Step 12.4: Commit**

```bash
git add lib/admin/user-detail.ts
git commit -m "feat(inventory): include customInventory in fetchAdminUserDetail"
```

---

## Task 13: 관리자 사용자 상세 페이지 통합

**Files:**
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 13.1: import 추가**

상단의 `import { InventoryAdjuster } from './InventoryAdjuster';` 아래에:

```typescript
import { CustomInventoryManager } from './CustomInventoryManager';
```

- [ ] **Step 13.2: destructure 갱신**

```typescript
const {
  profile: user,
  orders,
  deposits,
  transactions,
  inventory,
  customInventory,  // 추가
  products,
  totalSpent,
} = detail;
```

- [ ] **Step 13.3: "보유 재고" 섹션에 수기 항목 행 추가**

기존 보유재고 `<ul>` (`{inventory.map(...)}` 블록) 의 매핑 직후, 다음과 같이 수기 항목도 합쳐 표시:

```tsx
<ul className="p-5 space-y-2 text-sm">
  {inventory.length === 0 && customInventory.length === 0 && (
    <li className="text-muted-foreground">보유 재고가 없습니다.</li>
  )}
  {inventory.map((row) => (
    <li key={`p-${row.product_id}`} className="flex justify-between">
      <span>{getInventoryProductName(row)}</span>
      <span className="font-mono tabular">{row.quantity}</span>
    </li>
  ))}
  {customInventory
    .filter((row) => row.quantity > 0)
    .map((row) => (
      <li key={`c-${row.id}`} className="flex justify-between">
        <span>
          {row.name} <span className="text-xs text-muted-foreground">(수기)</span>
        </span>
        <span className="font-mono tabular">{row.quantity}</span>
      </li>
    ))}
</ul>
```

- [ ] **Step 13.4: `<InventoryAdjuster />` 바로 아래에 `CustomInventoryManager` 마운트**

```tsx
<InventoryAdjuster userId={user.id} products={products} />
<CustomInventoryManager userId={user.id} rows={customInventory} />
```

- [ ] **Step 13.5: typecheck**

```bash
npm run typecheck
```
Expected: 이 파일과 user-detail.ts 사이는 깨끗. inventory page 는 Task 14 에서 정리.

- [ ] **Step 13.6: Commit**

```bash
git add app/\(admin\)/admin/users/\[id\]/page.tsx
git commit -m "feat(inventory): mount CustomInventoryManager in admin user detail"
```

---

## Task 14: 사용자 `/inventory` 페이지 — UNION + 배지 + 새 라우트

**Files:**
- Modify: `app/(user)/inventory/page.tsx`

- [ ] **Step 14.1: 전체 재작성**

```tsx
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  computeAvailableInventory,
  type InventoryRow,
  type PendingShippingRow,
  type InventoryKey,
} from '@/lib/inventory';
import { Boxes, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InvJoin = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};

type CustomInvRow = {
  id: string;
  name: string;
  quantity: number;
};

type ShippingPendingItem = {
  items: Array<{
    product_id?: string;
    custom_inventory_id?: string;
    quantity?: number;
  }>;
};

function keyHref(k: InventoryKey): string {
  return k.kind === 'product'
    ? `/inventory/product/${k.product_id}`
    : `/inventory/custom/${k.custom_inventory_id}`;
}

function keyToReactKey(k: InventoryKey): string {
  return k.kind === 'product' ? `p:${k.product_id}` : `c:${k.custom_inventory_id}`;
}

export default async function InventoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;
  }

  const [{ data: invRaw }, { data: customInvRaw }, { data: pendingRaw }] = await Promise.all([
    supabase
      .from('user_inventory')
      .select('product_id, quantity, products(name)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    supabase
      .from('user_custom_inventory')
      .select('id, name, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    supabase
      .from('order_uploads')
      .select('items')
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ]);

  const inventory: InventoryRow[] = [
    ...((invRaw ?? []) as unknown as InvJoin[]).map((r) => ({
      key: { kind: 'product' as const, product_id: r.product_id },
      product_name: r.products?.name ?? '(이름 없음)',
      quantity: Number(r.quantity),
    })),
    ...((customInvRaw ?? []) as unknown as CustomInvRow[]).map((r) => ({
      key: { kind: 'custom' as const, custom_inventory_id: r.id },
      product_name: r.name,
      quantity: Number(r.quantity),
    })),
  ];

  const pendingShipments: PendingShippingRow[] = [];
  for (const u of (pendingRaw ?? []) as unknown as ShippingPendingItem[]) {
    for (const it of u.items ?? []) {
      const qty = Number(it.quantity ?? 0);
      if (it.product_id) {
        pendingShipments.push({
          key: { kind: 'product', product_id: it.product_id },
          quantity: qty,
        });
      } else if (it.custom_inventory_id) {
        pendingShipments.push({
          key: { kind: 'custom', custom_inventory_id: it.custom_inventory_id },
          quantity: qty,
        });
      }
    }
  }

  const rows = computeAvailableInventory(inventory, pendingShipments);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">보유 재고</h1>
          <p className="text-sm text-muted-foreground mt-1">
            엑시트몰 상품 구매가 승인되면 적립되고, 배송대행 업로드가 승인되면 차감됩니다.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <p className="font-medium">보유한 재고가 없습니다</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/shop" className="underline">
              상품
            </Link>
            을 구매한 뒤 관리자 승인을 받으면 여기에 적립됩니다.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-5 h-10">상품</th>
                <th className="font-medium px-3 text-right">가용</th>
                <th className="font-medium px-3 text-right">검토대기 예약</th>
                <th className="font-medium px-3 text-right">총 보유</th>
                <th className="font-medium px-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={keyToReactKey(r.key)} className="border-t">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span>{r.product_name}</span>
                      {r.key.kind === 'custom' && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          수기
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular">{r.available}</td>
                  <td className="px-3 py-3 text-right font-mono tabular text-amber-600">
                    {r.reserved > 0 ? r.reserved : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular text-muted-foreground">
                    {r.quantity}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={keyHref(r.key)} className="text-xs text-accent hover:underline">
                      변동 내역
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 14.2: typecheck**

```bash
npm run typecheck
```
Expected: 이 파일까지 깨끗. (`/inventory/product/[id]` 라우트는 다음 task 에서 이동.)

- [ ] **Step 14.3: Commit**

```bash
git add app/\(user\)/inventory/page.tsx
git commit -m "feat(inventory): union user_inventory + user_custom_inventory on user page"
```

---

## Task 15: 변동내역 라우트 분리 + 신규 custom 라우트

**Files:**
- Move: `app/(user)/inventory/[productId]/page.tsx` → `app/(user)/inventory/product/[id]/page.tsx`
- Create: `app/(user)/inventory/custom/[id]/page.tsx`

- [ ] **Step 15.1: 파일 이동 (`git mv`)**

```bash
mkdir -p app/\(user\)/inventory/product
git mv app/\(user\)/inventory/\[productId\]/page.tsx app/\(user\)/inventory/product/\[id\]/page.tsx
rmdir app/\(user\)/inventory/\[productId\]
```
PowerShell 환경이라면:
```powershell
New-Item -ItemType Directory -Path "app/(user)/inventory/product" -Force | Out-Null
git mv "app/(user)/inventory/[productId]/page.tsx" "app/(user)/inventory/product/[id]/page.tsx"
Remove-Item -Path "app/(user)/inventory/[productId]" -Recurse
```

- [ ] **Step 15.2: 이동한 파일에서 params 이름 정규화**

`app/(user)/inventory/product/[id]/page.tsx` 의 함수 시그니처/사용을 `params.productId` → `params.id` 로 갱신:

```typescript
export default async function InventoryProductTimeline({
  params,
}: {
  params: { id: string };
}) {
  // ...
  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', params.id)
    .single<{ id: string; name: string }>();
  // ...
  const { data: invRow } = await supabase
    .from('user_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('product_id', params.id)
    .maybeSingle();

  const { data: movRaw } = await supabase
    .from('inventory_movements')
    .select('id, delta, source_type, source_id, created_at')
    .eq('user_id', user.id)
    .eq('product_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200);
  // ...
}
```

상단 `Link href="/inventory"` 는 그대로.

- [ ] **Step 15.3: 새 custom 라우트 작성**

`app/(user)/inventory/custom/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, Wrench, Trash2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  admin_adjust: '관리자 조정',
  admin_delete: '관리자 삭제',
  shipping_upload_approved: '배송대행 승인',
};

type Movement = {
  id: string;
  delta: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

export default async function CustomInventoryTimeline({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;

  const { data: row } = await supabase
    .from('user_custom_inventory')
    .select('id, name, quantity')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; name: string; quantity: number }>();
  if (!row) notFound();

  const { data: movRaw } = await supabase
    .from('custom_inventory_movements')
    .select('id, delta, source_type, source_id, created_at')
    .eq('user_id', user.id)
    .eq('custom_inventory_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const movements = (movRaw ?? []) as Movement[];

  return (
    <div className="space-y-5">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        보유 재고
      </Link>

      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {row.name}{' '}
          <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">
            수기
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          현재 보유: <span className="font-mono tabular text-foreground">{row.quantity}</span>개
        </p>
      </header>

      {movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">변동 내역이 없습니다.</p>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {movements.map((m) => {
            const Icon =
              m.source_type === 'admin_delete'
                ? Trash2
                : m.source_type === 'admin_adjust'
                  ? Wrench
                  : m.delta > 0
                    ? ArrowUp
                    : ArrowDown;
            const cls = m.delta > 0 ? 'text-success' : 'text-destructive';
            return (
              <li key={m.id} className="p-4 flex items-center gap-3">
                <Icon className={`h-4 w-4 ${cls}`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{SOURCE_LABEL[m.source_type] ?? m.source_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('ko-KR')}
                    {m.source_id && (
                      <span className="ml-2 font-mono">{m.source_id.slice(0, 8)}</span>
                    )}
                  </p>
                </div>
                <span className={`font-mono tabular text-sm font-medium ${cls}`}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 15.4: typecheck + 테스트**

```bash
npm run typecheck
npm test
```
Expected: 둘 다 통과. 컴파일 에러 없음, 기존 + 신규 유닛 테스트 모두 PASS.

- [ ] **Step 15.5: Commit**

```bash
git add app/\(user\)/inventory/product/\[id\]/page.tsx app/\(user\)/inventory/custom/\[id\]/page.tsx
git commit -m "feat(inventory): split inventory timeline into product/custom routes"
```

---

## Task 16: dev 서버 띄워 수동 검증

**Files:** (변경 없음 — 시나리오 검증만)

- [ ] **Step 16.1: dev 서버 시작**

```bash
npm run dev
```
백그라운드로 띄워두고 다음 시나리오를 차례로 확인.

- [ ] **Step 16.2: 시나리오 1 — "(이름 없음)" 픽스**

1. 관리자 계정으로 `/admin/products` 에 들어가 임의 상품 1개를 비활성(`is_active=false`) 처리.
2. 해당 상품을 보유 중인 사용자로 로그인 → `/inventory` 진입.
3. **검증**: 상품명이 정상 표시 (예전에는 "(이름 없음)" 이었음).

- [ ] **Step 16.3: 시나리오 2 — 수기 항목 등록/조정/삭제**

1. 관리자로 `/admin/users/<X>` 진입.
2. **수기 보유 재고** 카드에서 "테스트수기" 5개 추가 → 행이 표에 등장 + "보유 재고" 섹션에 `(수기)` 배지로 노출.
3. 조정 +3 → 보유 8 로 갱신.
4. 사용자 화면(`/inventory`)에서 "테스트수기" 행이 `수기` 배지와 함께 8개로 표시.
5. 변동 내역 링크 클릭 → `/inventory/custom/<id>` 에서 두 movement(`+5`, `+3`) 확인.
6. 관리자로 돌아가 "삭제" → 확인 다이얼로그 → 삭제. 두 화면 모두에서 사라짐.

- [ ] **Step 16.4: 시나리오 3 — 출하 매칭 (수기 단독)**

1. 관리자가 사용자에게 수기 "수기상품" 5개 등록.
2. 사용자가 엑셀 양식에 "수기상품" 2개 행을 적어 배송대행 업로드.
3. **검증**: 업로드 성공 ("존재하지 않는 상품명" 에러가 나지 않아야 함).
4. 관리자가 승인 → 수기 잔량 3 로 감소, 변동 내역에 `-2` (배송대행 승인) 등장.

- [ ] **Step 16.5: 시나리오 4 — 혼합 + products 우선**

1. 관리자가 사용자에게 products "상품A" 활성, user_inventory 10 보유 + 수기 "상품A" 5 등록 (UNIQUE 는 customs 내부 제약뿐이라 등록 가능).
2. 사용자가 엑셀에 "상품A" 1개 적어 업로드 → 매칭이 **products** 로 가야 함.
3. 승인 후 user_inventory 가 9 로 감소, user_custom_inventory 의 "상품A" 는 5 유지.

- [ ] **Step 16.6: 시나리오 5 — 부족 검증**

1. 사용자에게 수기 "X" 2개 등록.
2. 사용자가 "X" 5개 업로드 시도.
3. 관리자 승인 → `INSUFFICIENT_INVENTORY` 에러 메시지 (기존 메시지와 동일 톤).

- [ ] **Step 16.7: dev 서버 정리 + 최종 typecheck/test**

```bash
npm run typecheck
npm test
npm run lint
```
Expected: 셋 다 통과.

- [ ] **Step 16.8: Commit (필요 시)**

수동 시나리오에서 발견한 보정만 따로 commit. 없다면 skip.

---

## 종료 체크리스트

- [ ] 마이그레이션 5개 모두 적용 + 정책/함수 SQL 검증 통과
- [ ] `npm test` 통과 (shipping-match, custom-inventory-error, inventory-calc 확장 포함)
- [ ] `npm run typecheck` 깨끗
- [ ] `npm run lint` 깨끗
- [ ] 수동 시나리오 1–5 모두 OK
- [ ] PR 본문에 spec 링크 + 마이그레이션 5개 목록 + 비-목표(YAGNI) 명시
