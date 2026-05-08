# 배송대행 흐름 재구성 — Phase 3: 보유 재고 화면 + /deposit·상품카드 표시 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 자기 보유 재고와 변동 내역을 확인할 수 있는 `/inventory` 화면을 신설하고, `/deposit` 잔액 표시를 "가용 vs 검토대기 예약"으로 분리하며, 상품 카드의 재고 표시를 "9개 이하 → 품절 임박" 배지로 단순화한다. 관리자에게는 보유 재고 수동 조정 UI를 추가한다.

**Architecture:** Phase 1 의 `user_inventory`·`inventory_movements` 테이블을 읽어 화면을 구성한다. "가용" = `user_inventory.quantity` − (검토대기 shipping_uploads 의 해당 상품 수량 합). "예약중" = 이 차이값. /deposit 의 가용 = `deposit_balance` − (검토대기 stock_orders.total_amount 합 + 검토대기 shipping_uploads.shipping_fee_total 합). 모든 계산은 server-side에서 한 번의 쿼리로.

**Tech Stack:** Next.js 14 (App Router, RSC), shadcn/ui, Tailwind, Vitest. `xlsx` 라이브러리는 사용하지 않음.

설계 문서: [docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md](../specs/2026-05-08-shipping-flow-restructure-design.md)
선행: Phase 1, 2 완료.

---

## File Structure

**Created:**
- `app/(user)/inventory/page.tsx` — 보유 재고 메인 화면 (상품별 표 + 변동 내역 링크)
- `app/(user)/inventory/[productId]/page.tsx` — 단일 상품 변동 내역 (movements timeline)
- `app/(admin)/admin/users/[id]/InventoryAdjuster.tsx` — 관리자 수동 조정 UI (client)
- `lib/actions/admin-inventory.ts` — `adjust_user_inventory` server action
- `lib/inventory.ts` — 가용/예약 계산 헬퍼 (server-only)
- `tests/unit/inventory-calc.test.ts` — 가용/예약 계산 단위 테스트
- `supabase/migrations/20260508000006_admin_adjust_inventory_rpc.sql` — `adjust_user_inventory` RPC

**Modified:**
- `app/(user)/deposit/page.tsx` — 가용/예약 분리 표시
- `app/(user)/shop/page.tsx` — ProductCard 호출 시 재고 표시 인자 변경
- `components/ProductCard.tsx` — 재고 ≤ 9 "품절 임박" 배지, 수량 절대 비표시
- `app/(admin)/admin/users/[id]/page.tsx` — 보유 재고 섹션 + 조정 UI 끼움
- `components/UserNav.tsx` 또는 사용자 navigation — `/inventory` 링크 추가

---

### Task 1: adjust_user_inventory RPC 추가 (관리자 수동 조정)

**Files:**
- Create: `supabase/migrations/20260508000006_admin_adjust_inventory_rpc.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- Phase 3.1: 관리자 보유 재고 수동 조정 RPC.
-- delta != 0. 음수 조정 시 quantity >= 0 보장.

create or replace function public.adjust_user_inventory(
  target_user uuid,
  product_id uuid,
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

  insert into public.user_inventory (user_id, product_id, quantity, updated_at)
  values (target_user, product_id, 0, now())
  on conflict (user_id, product_id) do nothing;

  select quantity into v_current from public.user_inventory
    where user_id = target_user and product_id = product_id for update;
  v_new := v_current + delta;
  if v_new < 0 then raise exception 'NEGATIVE_INVENTORY:%:%', v_current, delta; end if;

  update public.user_inventory
    set quantity = v_new, updated_at = now()
    where user_id = target_user and product_id = product_id;

  insert into public.inventory_movements
    (user_id, product_id, delta, source_type, source_id)
  values
    (target_user, product_id, delta, 'admin_adjust', null);
end; $$;

grant execute on function public.adjust_user_inventory(uuid, uuid, int, text) to authenticated;
```

- [ ] **Step 2: db reset 검증 + 타입 재생성**

```bash
./node_modules/supabase/bin/supabase.exe db reset
pnpm db:types
pnpm typecheck
```
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260508000006_admin_adjust_inventory_rpc.sql lib/db-types.ts
git commit -m "feat(db): adjust_user_inventory RPC (admin only)"
```

---

### Task 2: lib/inventory.ts — 가용/예약 계산 헬퍼

**Files:**
- Create: `lib/inventory.ts`
- Create: `tests/unit/inventory-calc.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/inventory-calc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeAvailableInventory,
  computeAvailableDeposit,
  type InventoryRow,
  type PendingShippingRow,
  type PendingStockOrderRow,
  type PendingShippingFeeRow,
} from '@/lib/inventory';

describe('computeAvailableInventory', () => {
  it('예약 없을 때 가용 = quantity', () => {
    const inv: InventoryRow[] = [{ product_id: 'p1', product_name: 'A', quantity: 30 }];
    const pending: PendingShippingRow[] = [];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      { product_id: 'p1', product_name: 'A', quantity: 30, reserved: 0, available: 30 },
    ]);
  });

  it('단일 상품 다중 검토대기 합산', () => {
    const inv: InventoryRow[] = [{ product_id: 'p1', product_name: 'A', quantity: 30 }];
    const pending: PendingShippingRow[] = [
      { product_id: 'p1', quantity: 5 },
      { product_id: 'p1', quantity: 3 },
    ];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      { product_id: 'p1', product_name: 'A', quantity: 30, reserved: 8, available: 22 },
    ]);
  });

  it('보유 0이지만 검토대기가 있는 상품도 행에 포함', () => {
    const inv: InventoryRow[] = [];
    const pending: PendingShippingRow[] = [{ product_id: 'p2', quantity: 1 }];
    const r = computeAvailableInventory(inv, pending);
    expect(r).toEqual([
      { product_id: 'p2', product_name: '(알 수 없는 상품)', quantity: 0, reserved: 1, available: -1 },
    ]);
  });
});

describe('computeAvailableDeposit', () => {
  it('예약 없을 때 가용 = balance', () => {
    expect(computeAvailableDeposit(100_000, [], [])).toEqual({
      balance: 100_000,
      stockReserved: 0,
      shippingReserved: 0,
      available: 100_000,
    });
  });

  it('stock + shipping 예약 모두 차감', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 30_000 }];
    const ship: PendingShippingFeeRow[] = [
      { id: 'u1', shipping_fee_total: 9_900 },
      { id: 'u2', shipping_fee_total: 6_600 },
    ];
    expect(computeAvailableDeposit(100_000, stock, ship)).toEqual({
      balance: 100_000,
      stockReserved: 30_000,
      shippingReserved: 16_500,
      available: 53_500,
    });
  });

  it('가용은 음수가 될 수 있다 (실제 처리 시 차단됨)', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 200_000 }];
    expect(computeAvailableDeposit(100_000, stock, [])).toEqual({
      balance: 100_000,
      stockReserved: 200_000,
      shippingReserved: 0,
      available: -100_000,
    });
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `pnpm vitest run tests/unit/inventory-calc.test.ts`
Expected: FAIL

- [ ] **Step 3: 헬퍼 작성**

`lib/inventory.ts`:

```typescript
export type InventoryRow = {
  product_id: string;
  product_name: string;
  quantity: number;
};

export type PendingShippingRow = {
  product_id: string;
  quantity: number;
};

export type AvailableInventoryRow = {
  product_id: string;
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

export function computeAvailableInventory(
  inventory: InventoryRow[],
  pendingShipments: PendingShippingRow[],
): AvailableInventoryRow[] {
  const reservedByProduct = new Map<string, number>();
  for (const r of pendingShipments) {
    reservedByProduct.set(
      r.product_id,
      (reservedByProduct.get(r.product_id) ?? 0) + r.quantity,
    );
  }

  const seen = new Set<string>();
  const result: AvailableInventoryRow[] = [];
  for (const inv of inventory) {
    seen.add(inv.product_id);
    const reserved = reservedByProduct.get(inv.product_id) ?? 0;
    result.push({
      product_id: inv.product_id,
      product_name: inv.product_name,
      quantity: inv.quantity,
      reserved,
      available: inv.quantity - reserved,
    });
  }
  // pending 만 있고 보유 0인 상품도 노출 (음수 가용 → 검토대기를 다 처리할 수 없음을 시각화)
  for (const [pid, reserved] of reservedByProduct) {
    if (seen.has(pid)) continue;
    result.push({
      product_id: pid,
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/unit/inventory-calc.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: 커밋**

```bash
git add lib/inventory.ts tests/unit/inventory-calc.test.ts
git commit -m "feat(inventory): computeAvailableInventory/Deposit + 단위 테스트"
```

---

### Task 3: /inventory 메인 화면

**Files:**
- Create: `app/(user)/inventory/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { computeAvailableInventory, type InventoryRow, type PendingShippingRow } from '@/lib/inventory';
import { Boxes, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InvJoin = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};

type ShippingPendingItem = {
  items: Array<{ product_code?: string; quantity?: number }>;
};

export default async function InventoryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;
  }

  // 1. 보유 재고 (보유 > 0)
  const { data: invRaw } = await supabase
    .from('user_inventory')
    .select('product_id, quantity, products(name)')
    .eq('user_id', user.id)
    .gt('quantity', 0);
  const inventory: InventoryRow[] = ((invRaw ?? []) as unknown as InvJoin[]).map((r) => ({
    product_id: r.product_id,
    product_name: r.products?.name ?? '(이름 없음)',
    quantity: Number(r.quantity),
  }));

  // 2. 검토대기 shipping_uploads 의 행별 product_code → product_id 매핑이 필요.
  //    Phase 4 완료 전까지는 검토대기 shipping_uploads 가 없으므로 빈 배열로 둔다.
  const { data: pendingRaw } = await supabase
    .from('order_uploads')
    .select('items')
    .eq('user_id', user.id)
    .eq('status', 'pending');

  const codes = new Set<string>();
  for (const u of (pendingRaw ?? []) as unknown as ShippingPendingItem[]) {
    for (const it of u.items ?? []) {
      if (it.product_code) codes.add(it.product_code);
    }
  }

  // 코드 → product_id 해석
  const productIdByCode = new Map<string, string>();
  if (codes.size > 0) {
    const { data: codeProducts } = await supabase
      .from('products')
      .select('id, name')
      .in('name', Array.from(codes));
    for (const p of (codeProducts ?? []) as Array<{ id: string; name: string }>) {
      productIdByCode.set(p.name, p.id);
    }
  }

  const pendingShipments: PendingShippingRow[] = [];
  for (const u of (pendingRaw ?? []) as unknown as ShippingPendingItem[]) {
    for (const it of u.items ?? []) {
      const pid = it.product_code ? productIdByCode.get(it.product_code) : undefined;
      if (!pid) continue;
      pendingShipments.push({ product_id: pid, quantity: Number(it.quantity ?? 0) });
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
            <Link href="/shop" className="underline">상품</Link>을 구매한 뒤 관리자 승인을 받으면 여기에 적립됩니다.
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
                <tr key={r.product_id} className="border-t">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {r.product_name}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular">{r.available}</td>
                  <td className="px-3 py-3 text-right font-mono tabular text-amber-600">
                    {r.reserved > 0 ? r.reserved : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular text-muted-foreground">{r.quantity}</td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/inventory/${r.product_id}`}
                      className="text-xs text-accent hover:underline"
                    >
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

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 수동 확인**

`/inventory` 접속:
1. 보유 재고가 있다면 표가 보임. 가용/예약/총보유 컬럼이 모두 표시됨.
2. 보유가 없으면 "보유한 재고가 없습니다" + 상품 링크.

- [ ] **Step 4: 커밋**

```bash
git add app/\(user\)/inventory/page.tsx
git commit -m "feat(inventory): /inventory 보유 재고 화면 신설"
```

---

### Task 4: /inventory/[productId] 변동 내역 화면

**Files:**
- Create: `app/(user)/inventory/[productId]/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, Wrench } from 'lucide-react';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  stock_order_approved: '재고 적립 승인',
  shipping_upload_approved: '배송대행 승인',
  admin_adjust: '관리자 조정',
};

type Movement = {
  id: string;
  delta: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

export default async function InventoryProductTimeline({
  params,
}: {
  params: { productId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;

  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', params.productId)
    .single<{ id: string; name: string }>();
  if (!product) notFound();

  const { data: invRow } = await supabase
    .from('user_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('product_id', params.productId)
    .maybeSingle<{ quantity: number }>();

  const { data: movRaw } = await supabase
    .from('inventory_movements')
    .select('id, delta, source_type, source_id, created_at')
    .eq('user_id', user.id)
    .eq('product_id', params.productId)
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
        <h1 className="font-heading font-semibold text-2xl tracking-tight">{product.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          현재 보유: <span className="font-mono tabular text-foreground">{invRow?.quantity ?? 0}</span>개
        </p>
      </header>

      {movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">변동 내역이 없습니다.</p>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {movements.map((m) => {
            const Icon = m.source_type === 'admin_adjust' ? Wrench : m.delta > 0 ? ArrowUp : ArrowDown;
            const cls = m.delta > 0 ? 'text-emerald-600' : 'text-rose-600';
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

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add app/\(user\)/inventory/\[productId\]/page.tsx
git commit -m "feat(inventory): 상품별 변동 내역 timeline 화면"
```

---

### Task 5: 사용자 navigation 에 /inventory 링크 추가

**Files:**
- Modify: `components/UserNav.tsx` 또는 `app/(user)/layout.tsx`

- [ ] **Step 1: nav 위치 찾기**

Run: `grep -r "주문 내역\|/orders" app/\(user\)/layout.tsx components/`

- [ ] **Step 2: "주문 내역" 다음에 "보유 재고" 항목 삽입**

수정 예시:

```tsx
<NavLink href="/orders">주문 내역</NavLink>
<NavLink href="/inventory">보유 재고</NavLink>
<NavLink href="/orders/upload">주문서 업로드</NavLink>
{/* ↑ Phase 4에서 /shipping-uploads 로 라벨 변경 */}
```

- [ ] **Step 3: 수동 확인 + 커밋**

Run: `pnpm dev`. 사용자 nav 에 "보유 재고" 항목 보이는지 확인.

```bash
git add components/UserNav.tsx app/\(user\)/layout.tsx
git commit -m "feat(nav): 사용자 메뉴에 /inventory 항목 추가"
```

---

### Task 6: /deposit 가용/예약 분리 표시

**Files:**
- Modify: `app/(user)/deposit/page.tsx`

- [ ] **Step 1: 현재 페이지 확인**

Run: `cat app/\(user\)/deposit/page.tsx`

- [ ] **Step 2: 가용/예약 계산 로직 끼움**

페이지 상단 데이터 패칭 부분을 다음 패턴으로 확장 (실제 구조에 맞춰 적용):

```tsx
import { computeAvailableDeposit } from '@/lib/inventory';
import { formatKRW } from '@/lib/money';

// ... 기존 패칭 ...

const [profileRes, stockPendingRes, shippingPendingRes] = await Promise.all([
  supabase.from('profiles').select('deposit_balance').eq('id', user.id).single<{ deposit_balance: number }>(),
  supabase.from('stock_orders').select('id, total_amount').eq('user_id', user.id).eq('status', 'pending'),
  supabase.from('order_uploads').select('id, shipping_fee_total').eq('user_id', user.id).eq('status', 'pending'),
]);

const balance = Number(profileRes.data?.deposit_balance ?? 0);
const stockPending = (stockPendingRes.data ?? []) as Array<{ id: string; total_amount: number }>;
const shippingPending = (shippingPendingRes.data ?? []) as Array<{ id: string; shipping_fee_total: number }>;

const dep = computeAvailableDeposit(
  balance,
  stockPending.map((s) => ({ id: s.id, total_amount: Number(s.total_amount) })),
  shippingPending.map((s) => ({ id: s.id, shipping_fee_total: Number(s.shipping_fee_total) })),
);
```

JSX 에서 잔액 카드 부분을:

```tsx
<div className="rounded-lg border bg-card p-5">
  <p className="text-xs text-muted-foreground uppercase tracking-wider">가용 예치금</p>
  <p className="font-mono tabular text-3xl font-bold mt-1">{formatKRW(dep.available)}</p>
  {(dep.stockReserved > 0 || dep.shippingReserved > 0) && (
    <p className="text-xs text-muted-foreground mt-2">
      잔액 {formatKRW(dep.balance)} · 검토대기 예약{' '}
      {formatKRW(dep.stockReserved + dep.shippingReserved)}
      {dep.stockReserved > 0 && (
        <span className="text-amber-600"> (재고 {formatKRW(dep.stockReserved)})</span>
      )}
      {dep.shippingReserved > 0 && (
        <span className="text-amber-600"> (배송 {formatKRW(dep.shippingReserved)})</span>
      )}
    </p>
  )}
</div>
```

기존 잔액 표시를 위 코드로 교체.

- [ ] **Step 3: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. `/deposit` 에서 검토대기 stock_order 가 있을 때 "검토대기 예약" 안내가 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/\(user\)/deposit/page.tsx
git commit -m "feat(deposit): 가용/검토대기 예약 분리 표시"
```

---

### Task 7: 상품 카드 — 재고 ≤ 9 "품절 임박" 배지, 수량 절대 비표시

**Files:**
- Modify: `components/ProductCard.tsx`

- [ ] **Step 1: 현재 컴포넌트 확인**

Run: `cat components/ProductCard.tsx`

- [ ] **Step 2: 카드 재고 표시 부분 변경**

기존 카드의 재고 관련 표시(예: "재고 N개", "재고 충분" 등) 모두 제거. 대신 다음 로직 추가:

```tsx
// Props 에 stock 이 이미 있다고 가정. ≤ 9 일 때만 배지.
const STOCK_THRESHOLD = 9;
const showLowStockBadge = product.stock >= 0 && product.stock <= STOCK_THRESHOLD;

// JSX 의 상단(이미지 영역 우측 상단)에:
{showLowStockBadge && (
  <span
    className="absolute top-2 right-2 inline-flex items-center h-5 px-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold"
    aria-label="품절 임박"
  >
    품절 임박
  </span>
)}
```

기존에 수량을 보여주던 코드는 모두 삭제. `재고 0` 인 경우는 ShopPage 에서 이미 visible 에서 빼므로 카드까지 안 옴 (현재 동작 유지).

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev`. `/shop` 에서:
1. 재고 ≥ 10 상품 카드 → 어떤 재고 표시도 없음
2. 재고 1~9 상품 카드 → 우상단 "품절 임박" 배지
3. 재고 0 상품 → 카드 자체 비표시

각 케이스를 위해 Supabase Studio 에서 `products.stock` 값을 직접 조정하며 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/ProductCard.tsx
git commit -m "feat(shop): 재고 ≤ 9 품절 임박 배지, 수량 항상 비표시"
```

---

### Task 8: 관리자 사용자 상세 — 보유 재고 섹션 + 조정 UI

**Files:**
- Create: `lib/actions/admin-inventory.ts`
- Create: `app/(admin)/admin/users/[id]/InventoryAdjuster.tsx`
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: server action 작성**

`lib/actions/admin-inventory.ts`:

```typescript
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

const adjustSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  delta: z.number().int().refine((v) => v !== 0, '0이 아닌 정수여야 합니다.'),
  memo: z.string().max(200).optional(),
});

export async function adjustUserInventoryAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(' · ') };
  }
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await (guard.supabase.rpc as any)('adjust_user_inventory', {
    target_user: parsed.data.userId,
    product_id: parsed.data.productId,
    delta: parsed.data.delta,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    if (error.message.startsWith('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.startsWith('ZERO_DELTA')) return { ok: false, error: '0이 아닌 값을 입력해주세요.' };
    if (error.message.startsWith('NEGATIVE_INVENTORY')) {
      const parts = error.message.split(':');
      return { ok: false, error: `잔여 재고가 부족합니다 (현재 ${parts[1]}, 적용하려는 변화 ${parts[2]}).` };
    }
    console.error('[admin-inventory] adjust', error);
    return { ok: false, error: '처리 중 오류가 발생했습니다.' };
  }
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  revalidatePath('/inventory');
  return { ok: true };
}
```

- [ ] **Step 2: client 조정 UI 작성**

`app/(admin)/admin/users/[id]/InventoryAdjuster.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { adjustUserInventoryAction } from '@/lib/actions/admin-inventory';

type Product = { id: string; name: string };

export function InventoryAdjuster({
  userId,
  products,
}: {
  userId: string;
  products: Product[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [delta, setDelta] = useState<number>(0);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">보유 재고 수동 조정</h3>
      <div className="grid grid-cols-3 gap-3">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Input
          type="number"
          placeholder="변화 (음수 가능)"
          value={Number.isFinite(delta) ? delta : 0}
          onChange={(e) => setDelta(parseInt(e.target.value, 10) || 0)}
        />
        <Input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        disabled={pending || !productId || delta === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await adjustUserInventoryAction({ userId, productId, delta, memo });
            if (!r.ok) {
              setError(r.error ?? '실패');
              return;
            }
            toast({ title: '조정 완료' });
            setDelta(0);
            setMemo('');
            router.refresh();
          })
        }
      >
        {pending ? '처리 중…' : '조정'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: 사용자 상세 페이지에 보유 재고 섹션 끼움**

`app/(admin)/admin/users/[id]/page.tsx` 의 적절한 위치(예: 잔액 섹션 아래)에 추가:

```tsx
import { InventoryAdjuster } from './InventoryAdjuster';

// ... 기존 데이터 패칭 ...
const [invRes, productsRes] = await Promise.all([
  supabase
    .from('user_inventory')
    .select('product_id, quantity, products(name)')
    .eq('user_id', params.id)
    .gt('quantity', 0),
  supabase.from('products').select('id, name').eq('is_active', true).order('name'),
]);
const inventory = (invRes.data ?? []) as Array<{
  product_id: string;
  quantity: number;
  products: { name: string } | null;
}>;
const products = (productsRes.data ?? []) as Array<{ id: string; name: string }>;

// JSX:
<section className="rounded-lg border bg-card">
  <header className="h-11 px-5 flex items-center gap-2 border-b">
    <h2 className="font-medium">보유 재고</h2>
  </header>
  <ul className="p-5 space-y-2 text-sm">
    {inventory.length === 0 && <li className="text-muted-foreground">보유 재고가 없습니다.</li>}
    {inventory.map((r) => (
      <li key={r.product_id} className="flex justify-between">
        <span>{r.products?.name ?? '(이름 없음)'}</span>
        <span className="font-mono tabular">{r.quantity}</span>
      </li>
    ))}
  </ul>
</section>

<InventoryAdjuster userId={params.id} products={products} />
```

- [ ] **Step 4: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 관리자로 `/admin/users/[id]` 접속:
1. 보유 재고 표가 보임
2. 상품/변화/메모 입력 후 조정 → 토스트, 표 갱신
3. 음수 조정으로 0 이하가 되면 "잔여 재고 부족" 에러
4. Supabase Studio 에서 `inventory_movements` 에 source_type='admin_adjust' 행 추가 확인

- [ ] **Step 5: 커밋**

```bash
git add lib/actions/admin-inventory.ts app/\(admin\)/admin/users/\[id\]/
git commit -m "feat(admin): 사용자 상세에 보유 재고 + 수동 조정 UI"
```

---

### Task 9: 전체 회귀 검증

- [ ] **Step 1: typecheck / test / lint / build**

Run:
```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Expected: 모두 PASS

- [ ] **Step 2: smoke 시나리오**

1. 사용자: `/checkout` 검토 요청 → `/deposit` 가용·예약 표시 확인
2. 관리자: 승인 → 사용자 `/inventory` 에 적립 확인
3. 관리자: `/admin/users/[id]` 에서 -1 조정 → `/inventory/[productId]` 에 admin_adjust 항목 추가
4. 상품 카드: 재고 9 이하 일 때 배지, 10 이상은 표시 없음

Phase 3 완료. Phase 4 (배송대행 업로드 — 양식·재고 차감)로 진행.
