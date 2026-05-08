# 배송대행 흐름 재구성 — Phase 2: 흐름 1 (엑시트몰 상품 구매 → 검토대기 → 승인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 `/checkout` 에서 결제 시 배송정보 입력 단계가 사라지고 "검토 요청" 으로 stock_orders pending 행이 생긴다. 관리자는 기존 `주문서 업로드` 메뉴 위치(이름은 `주문관리`)에서 검토대기 stock_orders 를 승인/반려한다.

**Architecture:** Phase 1에서 만든 `request_stock_order` / `approve_stock_order` / `reject_stock_order` / `cancel_stock_order` RPC를 UI에 연결한다. 기존 `placeOrderAction`은 더 이상 사용하지 않지만 코드는 Phase 5에서 정리할 때까지 보존(legacy 주문 화면이 호출 안 함). 관리자 메뉴 swap은 라우트를 새로 만들고 nav 컴포넌트에서 매핑만 바꾼다.

**Tech Stack:** Next.js 14 (App Router, Server Actions), shadcn/ui, Tailwind, Vitest. 기존 패턴 그대로 재사용.

설계 문서: [docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md](../specs/2026-05-08-shipping-flow-restructure-design.md)
선행: Phase 1 완료 ([phase1-db-model.md](2026-05-08-shipping-flow-phase1-db-model.md))

---

## File Structure

**Created:**
- `app/(admin)/admin/orders/page.tsx` — **덮어쓰기**: 새 stock_orders 검토 화면 (이름 "주문관리")
- `app/(admin)/admin/orders/[id]/page.tsx` — **덮어쓰기**: stock_order 상세 + 승인/반려 액션
- `app/(admin)/admin/orders/[id]/ReviewActions.tsx` — 승인/반려 버튼 (client component)
- `app/(admin)/admin/orders-legacy/page.tsx` — 기존 일반 주문 목록 이동 (열람 전용)
- `app/(admin)/admin/orders-legacy/[id]/page.tsx` — 기존 일반 주문 상세 이동 (열람 전용)
- `app/(user)/orders/StockOrderCancelButton.tsx` — pending stock_order 취소 버튼 (client)
- `tests/unit/stock-order-checkout.test.ts` — checkout 입력 변환 단위 테스트

**Modified:**
- `app/(user)/checkout/page.tsx` — 배송정보 섹션 제거, 버튼 = "검토 요청", `requestStockOrderAction` 호출
- `app/(user)/orders/page.tsx` — stock_orders 표시 추가 (검토대기/반려/승인 + 취소 버튼)
- `components/AdminNav.tsx` (또는 관리자 navigation 위치) — 메뉴 라벨 정정, legacy 링크 추가
- `components/StatusBadge.tsx` — `StockOrderStatusBadge` 추가
- `components/CartProvider.tsx` — 변경 없음 (확인용)

**Read but not changed (참조):**
- `lib/actions/stock-order.ts` (Phase 1 에서 생성)

---

### Task 1: StatusBadge 확장

**Files:**
- Modify: `components/StatusBadge.tsx`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat components/StatusBadge.tsx` 또는 IDE 에서 열기. `OrderStatusBadge`, `OrderUploadStatusBadge` 가 있을 것.

- [ ] **Step 2: 새 배지 컴포넌트 추가**

`components/StatusBadge.tsx` 파일 끝에 추가:

```typescript
import { STOCK_ORDER_STATUS_LABEL, type StockOrderStatus } from '@/lib/types';

const STOCK_ORDER_BADGE_CLASS: Record<StockOrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-zinc-50 text-zinc-600 border-zinc-200',
};

export function StockOrderStatusBadge({ status }: { status: StockOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded text-[11px] font-medium border ${STOCK_ORDER_BADGE_CLASS[status]}`}
    >
      {STOCK_ORDER_STATUS_LABEL[status]}
    </span>
  );
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add components/StatusBadge.tsx
git commit -m "feat(ui): add StockOrderStatusBadge component"
```

---

### Task 2: /checkout 페이지 변경 — 배송정보 제거, 검토 요청

**Files:**
- Modify: `app/(user)/checkout/page.tsx`

- [ ] **Step 1: 현재 코드 확인**

기존 파일은 `placeOrderAction` 을 호출하고, 배송정보 4개 입력 필드(`name/phone/address/memo`)를 가짐. 이 부분 모두 제거.

- [ ] **Step 2: 페이지 전체 교체**

`app/(user)/checkout/page.tsx` 전체를 다음으로 교체:

```typescript
'use client';
import { useCart } from '@/components/CartProvider';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestStockOrderAction } from '@/lib/actions/stock-order';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Wallet, ShoppingCart } from 'lucide-react';

export default function CheckoutPage() {
  const { items, total, remove, clear } = useCart();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-muted grid place-items-center">
          <ShoppingCart className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="font-medium">장바구니가 비어있습니다</p>
        <Button asChild variant="outline">
          <Link href="/shop">상품 보러가기</Link>
        </Button>
      </div>
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await requestStockOrderAction({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      if (!result.ok) {
        setError(result.error);
        if (result.productId) remove(result.productId);
        return;
      }
      clear();
      toast({
        title: '검토 요청이 접수되었습니다',
        description: '관리자가 승인하면 보유 재고에 적립됩니다.',
      });
      router.push('/orders');
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">검토 요청</h1>
        <Link
          href="/cart"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          장바구니로 돌아가기
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 space-y-6">
          <div className="rounded-lg border bg-card">
            <div className="p-5 border-b">
              <h2 className="font-heading font-semibold">결제 수단</h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-md border bg-accent/5 p-4 flex items-center gap-3">
                <Wallet className="h-5 w-5 text-accent" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium text-sm">예치금 결제 (검토 시 차감)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    승인 시점에 예치금이 차감되고 보유 재고에 적립됩니다. 검토대기 동안은 가용 잔액에서 예약만 됩니다.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                실제 발송은 <Link href="/shipping-uploads" className="underline">배송대행 업로드</Link>{' '}
                메뉴에서 받는사람 명단을 올리면 진행됩니다. 이 단계에서는 배송지를 입력하지 않습니다.
              </p>
            </div>
          </div>
        </section>

        <aside className="lg:col-span-4 self-start space-y-4">
          <div className="rounded-lg border bg-card">
            <div className="p-5 border-b">
              <h2 className="font-heading font-semibold">주문 항목</h2>
            </div>
            <ul className="p-5 space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.productId} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground min-w-0">
                    <span className="text-foreground">{i.name}</span>
                    <span className="text-muted-foreground"> × {i.quantity}</span>
                  </span>
                  <span className="font-mono tabular text-foreground whitespace-nowrap">
                    {formatKRW(i.price * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-4 border-t flex items-baseline justify-between">
              <span className="font-medium">예상 차감액</span>
              <span className="font-mono tabular text-xl font-semibold">{formatKRW(total)}</span>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3 animate-slide-up-fade"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
          )}

          <Button onClick={submit} disabled={pending} className="w-full h-11">
            {pending ? '요청 중…' : `${formatKRW(total)} 검토 요청`}
          </Button>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 수동 확인 — 개발 서버**

Run: `pnpm dev`. 브라우저에서:
1. `/shop` 에서 상품 1개 장바구니에 추가
2. `/cart` → 결제 진행 → `/checkout` 로 이동
3. 화면에 "검토 요청" 제목, 결제수단 카드, 주문 항목 카드, "검토 요청" 버튼만 보이는지 확인
4. 버튼 클릭 → "검토 요청이 접수되었습니다" 토스트 + `/orders` 로 이동 확인
5. 다시 `/cart` 비어있는지 확인

Expected: 위 5가지 모두 동작.

- [ ] **Step 5: 커밋**

```bash
git add app/\(user\)/checkout/page.tsx
git commit -m "feat(checkout): 배송정보 제거, 검토 요청 버튼으로 전환"
```

---

### Task 3: 관리자 기존 주문 화면 → /admin/orders-legacy 로 이동 (열람 전용)

**Files:**
- Create: `app/(admin)/admin/orders-legacy/page.tsx`
- Create: `app/(admin)/admin/orders-legacy/[id]/page.tsx`
- Read: 기존 `app/(admin)/admin/orders/page.tsx`, `app/(admin)/admin/orders/[id]/page.tsx`

- [ ] **Step 1: 기존 파일을 legacy 위치로 복사**

```bash
mkdir -p app/\(admin\)/admin/orders-legacy
cp -r app/\(admin\)/admin/orders/page.tsx app/\(admin\)/admin/orders-legacy/page.tsx
cp -r app/\(admin\)/admin/orders/\[id\]/page.tsx app/\(admin\)/admin/orders-legacy/\[id\]/page.tsx
cp -r app/\(admin\)/admin/orders/\[id\]/TransitionButtons.tsx app/\(admin\)/admin/orders-legacy/\[id\]/TransitionButtons.tsx
```

- [ ] **Step 2: legacy 화면을 읽기 전용으로 표시 변경**

`app/(admin)/admin/orders-legacy/page.tsx` 헤더에 빨간 배너 추가:

기존 `<div className="space-y-5">` 시작 직후에 다음 추가:

```tsx
<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
  <strong>Legacy 주문</strong> — 옛 일반 주문 흐름. 신규 주문은 <a href="/admin/orders" className="underline">주문관리(흐름 1)</a> 또는 <a href="/admin/shipping-uploads" className="underline">배송대행 업로드(흐름 2)</a> 에서 처리합니다.
</div>
```

`app/(admin)/admin/orders-legacy/[id]/page.tsx` 도 동일 배너 추가.

- [ ] **Step 3: legacy 화면의 모든 링크를 legacy 경로로 수정**

`href="/admin/orders` 또는 `href={\`/admin/orders/...\`}` 형태를 모두 `href="/admin/orders-legacy` 로 변경. 두 파일 모두에서. 검색-치환:

```bash
# 두 파일 모두에서 /admin/orders/ → /admin/orders-legacy/ 치환 (수동으로 또는 IDE 검색-치환)
```

찾을 패턴: `/admin/orders` (단, 정확한 경로 매칭).
바꿀 값: `/admin/orders-legacy`.

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/\(admin\)/admin/orders-legacy/
git commit -m "chore(admin): copy 기존 주문 화면 → /admin/orders-legacy (열람 전용)"
```

---

### Task 4: 새 /admin/orders 페이지 — stock_orders 검토 목록

**Files:**
- Modify: `app/(admin)/admin/orders/page.tsx` (기존 내용 전체 대체)

- [ ] **Step 1: 페이지 전체 교체**

```tsx
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type StockOrderStatus, STOCK_ORDER_STATUS_LABEL } from '@/lib/types';
import { StockOrderStatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { ChevronRight, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: { key: StockOrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'cancelled', label: '취소' },
];

type Row = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: Array<{ qty: number; product_name: string }>;
  created_at: string;
  profiles: { name: string } | null;
};

export default async function AdminStockOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = (searchParams.status ?? 'all') as StockOrderStatus | 'all';

  let q = supabase
    .from('stock_orders')
    .select('id,user_id,total_amount,status,items,created_at,profiles!stock_orders_user_id_fkey(name)')
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const { data: allForCounts } = await supabase.from('stock_orders').select('status');
  const counts = ((allForCounts ?? []) as { status: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            엑시트몰 상품 구매 검토 — 전체 {counts.all ?? 0}건 · 검토대기 {counts.pending ?? 0}건
          </p>
        </div>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const active = status === t.key;
              const c = counts[t.key] ?? 0;
              return (
                <Link
                  key={t.key}
                  href={`/admin/orders${t.key === 'all' ? '' : `?status=${t.key}`}`}
                  className={cn(
                    'relative flex items-center gap-2 px-4 h-11 text-sm border-b-2 transition-colors whitespace-nowrap',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-mono tabular',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {c}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">
              {status === 'all'
                ? '주문이 없습니다'
                : `${STOCK_ORDER_STATUS_LABEL[status as StockOrderStatus]} 상태의 주문이 없습니다`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10">주문 번호</th>
                  <th className="font-medium px-3">고객</th>
                  <th className="font-medium px-3">상품 (요약)</th>
                  <th className="font-medium px-3 text-right">금액</th>
                  <th className="font-medium px-3">상태</th>
                  <th className="font-medium px-3">요청 시각</th>
                  <th className="font-medium px-3 w-8" aria-label="이동"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const summary =
                    o.items.length === 0
                      ? '(빈 주문)'
                      : o.items.length === 1
                        ? `${o.items[0]!.product_name} × ${o.items[0]!.qty}`
                        : `${o.items[0]!.product_name} 외 ${o.items.length - 1}건`;
                  return (
                    <tr key={o.id} className="border-t h-11 hover:bg-surface-muted/60 transition-colors">
                      <td className="px-4">
                        <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-accent hover:underline">
                          {o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3">
                        {o.profiles?.name ?? (
                          <span className="text-muted-foreground font-mono text-xs">{o.user_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 text-muted-foreground truncate max-w-[240px]">{summary}</td>
                      <td className="px-3 text-right font-mono tabular">{formatKRW(Number(o.total_amount))}</td>
                      <td className="px-3">
                        <StockOrderStatusBadge status={o.status as StockOrderStatus} />
                      </td>
                      <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(o.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 text-right">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          aria-label="상세 보기"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add app/\(admin\)/admin/orders/page.tsx
git commit -m "feat(admin): /admin/orders 를 stock_orders 검토 목록으로 교체"
```

---

### Task 5: /admin/orders/[id] 상세 + 승인/반려 액션

**Files:**
- Modify: `app/(admin)/admin/orders/[id]/page.tsx` (전체 교체)
- Create: `app/(admin)/admin/orders/[id]/ReviewActions.tsx`

- [ ] **Step 1: 승인/반려 server action 추가**

`lib/actions/admin-stock-orders.ts` 신규 작성:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';
import { mapStockOrderError } from '@/lib/actions/stock-order';

export async function approveStockOrderAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('approve_stock_order', { order_id: orderId });
  if (error) {
    console.error('[admin-stock-orders] approve', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function rejectStockOrderAction(
  orderId: string,
  memo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('reject_stock_order', {
    order_id: orderId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-stock-orders] reject', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  return { ok: true };
}
```

- [ ] **Step 2: ReviewActions 클라이언트 컴포넌트 작성**

`app/(admin)/admin/orders/[id]/ReviewActions.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  approveStockOrderAction,
  rejectStockOrderAction,
} from '@/lib/actions/admin-stock-orders';

export function ReviewActions({ orderId }: { orderId: string }) {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function approve() {
    setError(null);
    start(async () => {
      const r = await approveStockOrderAction(orderId);
      if (!r.ok) {
        setError(r.error ?? '승인 실패');
        return;
      }
      toast({ title: '승인되었습니다', description: '보유 재고에 적립되었습니다.' });
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    if (!memo.trim()) {
      setError('반려 사유를 입력해주세요.');
      return;
    }
    start(async () => {
      const r = await rejectStockOrderAction(orderId, memo.trim());
      if (!r.ok) {
        setError(r.error ?? '반려 실패');
        return;
      }
      toast({ title: '반려되었습니다' });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">검토 처리</h3>
      <Textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="반려 시 사유를 입력해주세요"
        rows={3}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={approve} disabled={pending} className="flex-1">
          승인 (재고 적립 + 예치금 차감)
        </Button>
        <Button onClick={reject} disabled={pending} variant="outline" className="flex-1">
          반려
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 상세 페이지 작성**

`app/(admin)/admin/orders/[id]/page.tsx` 전체 교체:

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type StockOrderStatus } from '@/lib/types';
import { StockOrderStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, User, Package } from 'lucide-react';
import { ReviewActions } from './ReviewActions';

export const dynamic = 'force-dynamic';

type Item = {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
};

type StockOrder = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: Item[];
  admin_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export default async function AdminStockOrderDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('stock_orders')
    .select('*,profiles!stock_orders_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', params.id)
    .single<StockOrder>();
  if (!data) notFound();

  const balance = Number(data.profiles?.deposit_balance ?? 0);
  const insufficient = data.status === 'pending' && balance < Number(data.total_amount);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        주문관리 목록
      </Link>

      <header className="pb-4 border-b flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문 상세 (재고 적립)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular">{data.id.slice(0, 8)}</span> ·{' '}
            {new Date(data.created_at).toLocaleString('ko-KR', {
              year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <StockOrderStatusBadge status={data.status as StockOrderStatus} />
      </header>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">고객</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted-foreground text-xs">이름</dt><dd>{data.profiles?.name ?? '—'}</dd></div>
          <div><dt className="text-muted-foreground text-xs">이메일</dt><dd className="font-mono">{data.profiles?.email ?? '—'}</dd></div>
          <div><dt className="text-muted-foreground text-xs">연락처</dt><dd className="font-mono">{data.profiles?.phone ?? '—'}</dd></div>
          <div>
            <dt className="text-muted-foreground text-xs">예치금</dt>
            <dd className={`font-mono ${insufficient ? 'text-destructive font-medium' : ''}`}>{formatKRW(balance)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border bg-card">
        <header className="h-11 px-5 flex items-center gap-2 border-b">
          <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">주문 항목</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-5 h-10">상품</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">단가</th>
              <th className="font-medium px-3 text-right">소계</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-5 py-2">{it.product_name}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.qty}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(it.unit_price)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-5 py-3 font-medium text-right">합계</td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(data.total_amount))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data.status === 'rejected' && data.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {data.admin_memo}
        </div>
      )}

      {data.status === 'pending' && (
        <>
          {insufficient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              고객의 가용 예치금이 부족합니다. 승인 시 차감 단계에서 실패할 수 있습니다.
            </div>
          )}
          <ReviewActions orderId={data.id} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `pnpm dev`. 관리자로 로그인 후 `/admin/orders` 접속:
1. 검토대기 탭에 Task 2에서 만든 stock_order 가 보이는지
2. 상세 클릭 → 고객 정보·항목·승인/반려 버튼 보이는지
3. 반려 사유 입력하고 반려 → 토스트 + 상태가 "반려"로 변경되는지
4. 새 stock_order 만들어서 승인 → "승인되었습니다" 토스트, /admin/orders 목록에서 status 변경 확인
5. Supabase Studio 에서 `user_inventory` 와 `inventory_movements` 에 행이 들어갔는지, `profiles.deposit_balance` 가 차감됐는지 확인

Expected: 5가지 모두 동작.

- [ ] **Step 6: 커밋**

```bash
git add lib/actions/admin-stock-orders.ts app/\(admin\)/admin/orders/\[id\]/
git commit -m "feat(admin): stock_order 상세 + 승인/반려 액션"
```

---

### Task 6: 고객 /orders 페이지에 stock_orders 섹션 추가

**Files:**
- Modify: `app/(user)/orders/page.tsx`
- Create: `app/(user)/orders/StockOrderCancelButton.tsx`

- [ ] **Step 1: 취소 버튼 client component 작성**

`app/(user)/orders/StockOrderCancelButton.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelStockOrderAction } from '@/lib/actions/stock-order';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function StockOrderCancelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelStockOrderAction(orderId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '검토 요청을 취소했습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '취소 중…' : '취소'}
    </Button>
  );
}
```

- [ ] **Step 2: /orders 페이지 수정 — stock_orders 섹션 상단 추가**

`app/(user)/orders/page.tsx` 의 상단(헤더 다음, 기존 list rendering 이전)에 stock_orders 섹션을 새로 끼운다. 기존 `orders` 표시는 "Legacy 주문" 으로 라벨링하여 그대로 둔다(Phase 5 에서 정리).

전체 교체:

```tsx
import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/money';
import { type OrderStatus, type StockOrderStatus } from '@/lib/types';
import { OrderStatusBadge, StockOrderStatusBadge } from '@/components/StatusBadge';
import { OrderCancelButton } from '@/components/OrderCancelButton';
import { StockOrderCancelButton } from './StockOrderCancelButton';
import { Inbox, Truck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getTrackingUrl, isCjCarrier } from '@/lib/tracking';
import { DeliveryTrackingLookup } from '@/components/DeliveryTrackingLookup';

export const dynamic = 'force-dynamic';

type StockItem = { product_id: string; product_name: string; qty: number; subtotal: number };
type StockOrder = {
  id: string;
  total_amount: number;
  status: string;
  items: StockItem[];
  admin_memo: string | null;
  created_at: string;
};

type LegacyOrderItem = { product_name: string; quantity: number; subtotal: number };
type LegacyOrder = {
  id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  order_items: LegacyOrderItem[];
};

export default async function MyOrdersPage() {
  const supabase = createClient();
  const [stockRes, legacyRes] = await Promise.all([
    supabase
      .from('stock_orders')
      .select('id,total_amount,status,items,admin_memo,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id,total_amount,status,shipping_name,tracking_number,carrier,created_at,order_items(product_name,quantity,unit_price,subtotal)')
      .order('created_at', { ascending: false }),
  ]);
  const stockOrders = (stockRes.data ?? []) as unknown as StockOrder[];
  const legacy = (legacyRes.data ?? []) as unknown as LegacyOrder[];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문 내역</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular font-medium text-foreground">
              {stockOrders.length + legacy.length}
            </span>건
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">엑시트몰 상품 (재고 적립)</h2>
        {stockOrders.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">검토 요청 내역이 없습니다</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/shop">상품 보러가기</Link>
            </Button>
          </div>
        ) : (
          stockOrders.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card">
              <header className="flex items-center justify-between gap-3 p-4 border-b">
                <span className="font-mono text-xs text-muted-foreground truncate">
                  주문번호 {o.id.slice(0, 8)} ·{' '}
                  {new Date(o.created_at).toLocaleString('ko-KR', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <StockOrderStatusBadge status={o.status as StockOrderStatus} />
              </header>
              <div className="p-4 space-y-1 text-sm">
                {o.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      <span className="text-foreground">{it.product_name}</span>
                      <span className="text-muted-foreground"> × {it.qty}</span>
                    </span>
                    <span className="font-mono tabular text-muted-foreground">{formatKRW(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              {o.status === 'rejected' && o.admin_memo && (
                <p className="px-4 pb-3 text-xs text-destructive">반려 사유: {o.admin_memo}</p>
              )}
              <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-surface-muted/40">
                <span className="font-mono tabular text-lg font-semibold">{formatKRW(Number(o.total_amount))}</span>
                {o.status === 'pending' && <StockOrderCancelButton orderId={o.id} />}
              </footer>
            </article>
          ))
        )}
      </section>

      {legacy.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading font-semibold text-lg text-muted-foreground">Legacy 주문 (구 일반 주문)</h2>
          {legacy.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card">
              <header className="flex items-center justify-between gap-3 p-4 border-b">
                <span className="font-mono text-xs text-muted-foreground truncate">
                  주문번호 {o.id.slice(0, 8)} ·{' '}
                  {new Date(o.created_at).toLocaleString('ko-KR', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </header>
              <div className="p-4 space-y-1 text-sm">
                {o.order_items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      <span className="text-foreground">{it.product_name}</span>
                      <span className="text-muted-foreground"> × {it.quantity}</span>
                    </span>
                    <span className="font-mono tabular text-muted-foreground">{formatKRW(Number(it.subtotal))}</span>
                  </div>
                ))}
              </div>
              {o.tracking_number && (
                <div className="px-4 pb-3 space-y-2">
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-surface-muted text-xs">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {o.carrier && <span className="text-muted-foreground">{o.carrier}</span>}
                    <span className="font-mono tabular">{o.tracking_number}</span>
                    {(() => {
                      const url = getTrackingUrl(o.carrier, o.tracking_number);
                      return url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          조회
                        </a>
                      ) : null;
                    })()}
                  </span>
                  {isCjCarrier(o.carrier) && <DeliveryTrackingLookup orderId={o.id} />}
                </div>
              )}
              <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-surface-muted/40">
                <span className="font-mono tabular text-lg font-semibold">{formatKRW(Number(o.total_amount))}</span>
                {o.status === 'placed' && <OrderCancelButton orderId={o.id} />}
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 수동 확인**

`/orders` 접속:
1. 상단에 "엑시트몰 상품 (재고 적립)" 섹션이 보이고, 검토대기 stock_orders 가 표시됨
2. pending 상태에 "취소" 버튼이 있고, 클릭 시 status=cancelled 로 변경
3. 기존 일반 주문이 있다면 "Legacy 주문" 섹션이 아래에 표시됨

- [ ] **Step 5: 커밋**

```bash
git add app/\(user\)/orders/
git commit -m "feat(orders): stock_orders 섹션 + 취소 버튼, legacy 주문 분리"
```

---

### Task 7: 관리자 navigation 라벨 정정

**Files:**
- Modify: `components/AdminNav.tsx` 또는 `app/(admin)/admin/layout.tsx` 등 관리자 네비게이션 컴포넌트

- [ ] **Step 1: 현재 nav 컴포넌트 위치 확인**

Run: `grep -r "주문서 업로드" app/ components/ | head -20`

가장 가까운 nav 컴포넌트를 찾는다 (보통 `app/(admin)/admin/layout.tsx` 또는 `components/AdminNav.tsx`).

- [ ] **Step 2: 라벨 변경**

찾은 nav 파일에서:
- `'주문서 업로드'` (또는 동등한 표현) `/admin/order-uploads` 항목 → 라벨 그대로, 단 Phase 4 직전까지는 기존 화면 유지. 이번 Phase 에서는 건드리지 않음 — 즉 Phase 4 에서 다시 다룬다.
- `'주문관리'` `/admin/orders` 항목 → 그대로 (기존 라벨 유지). 콘텐츠는 이미 stock_orders 로 바뀜.
- 기존 일반 주문 화면 접근 경로가 사라졌으므로 nav 에 `'Legacy 주문'` `/admin/orders-legacy` 작은 링크를 한시적으로 추가.

수정 예시 (실제 파일 구조에 맞춰 적용):

```tsx
{/* 기존 항목 유지: 주문관리 (이제는 stock_orders) */}
<NavLink href="/admin/orders">주문관리</NavLink>
<NavLink href="/admin/order-uploads">주문서 업로드</NavLink>

{/* 신규 한시적 링크 — Phase 5 에서 archive 후 제거 */}
<NavLink href="/admin/orders-legacy" className="text-xs text-muted-foreground">
  Legacy 주문
</NavLink>
```

- [ ] **Step 3: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 관리자로 접속해서 사이드바/탑네브에 위 항목이 정상 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/AdminNav.tsx app/\(admin\)/admin/layout.tsx
git commit -m "chore(admin nav): legacy 주문 링크 추가, 주문관리 라벨 유지"
```

---

### Task 8: Phase 1의 OrdersRealtime 컴포넌트 → stock_orders 채널도 구독

**Files:**
- Modify: `components/OrdersRealtime.tsx`

- [ ] **Step 1: 현재 컴포넌트 확인**

Run: `cat components/OrdersRealtime.tsx`

기존 코드는 `orders` 테이블만 구독함. `stock_orders` 도 추가해야 함.

- [ ] **Step 2: 두 채널 구독으로 확장**

`components/OrdersRealtime.tsx` 를 다음과 같이 수정:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/hooks/use-toast';

export function OrdersRealtime() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-new-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_orders' },
        () => {
          toast({ title: '새 검토 요청', description: '주문관리에서 확인하세요.' });
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_uploads' },
        () => {
          toast({ title: '새 배송대행 업로드', description: '검토대기 항목이 추가됐습니다.' });
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, toast]);

  return null;
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 수동 확인**

두 브라우저 창을 띄워:
1. 창 A: 관리자로 `/admin/orders` 접속
2. 창 B: 일반 사용자로 `/checkout` 에서 검토 요청 진행
3. 창 A 에서 "새 검토 요청" 토스트가 뜨고 목록이 새로고침되는지 확인

Expected: 토스트와 새로고침 정상 동작.

- [ ] **Step 5: 커밋**

```bash
git add components/OrdersRealtime.tsx
git commit -m "feat(realtime): stock_orders 채널 구독 추가"
```

---

### Task 9: 단위 테스트 — checkout 입력 변환

**Files:**
- Create: `tests/unit/stock-order-checkout.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest';

// /checkout 페이지가 cart items → request_stock_order RPC payload 로 변환하는 로직.
// 페이지 자체는 client component 라 import 어려우므로, 변환 로직을 lib 로 추출하고 테스트한다.
import { cartToStockOrderPayload } from '@/lib/cart-to-stock-order';

describe('cartToStockOrderPayload', () => {
  it('cart items → { items: [{productId, quantity}] }', () => {
    const cart = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 2 },
      { productId: 'p2', name: 'B', price: 500, quantity: 1 },
    ];
    expect(cartToStockOrderPayload(cart)).toEqual({
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
  });

  it('빈 카트 → items: []', () => {
    expect(cartToStockOrderPayload([])).toEqual({ items: [] });
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `pnpm vitest run tests/unit/stock-order-checkout.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 변환 함수 추출**

`lib/cart-to-stock-order.ts`:

```typescript
export type CartLine = { productId: string; name: string; price: number; quantity: number };

export function cartToStockOrderPayload(items: CartLine[]) {
  return {
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
}
```

`app/(user)/checkout/page.tsx` 의 인라인 변환 코드를 이 함수로 교체:

```diff
- const result = await requestStockOrderAction({
-   items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
- });
+ const result = await requestStockOrderAction(cartToStockOrderPayload(items));
```

`import { cartToStockOrderPayload } from '@/lib/cart-to-stock-order';` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/unit/stock-order-checkout.test.ts`
Expected: PASS — 2/2.

- [ ] **Step 5: 커밋**

```bash
git add lib/cart-to-stock-order.ts tests/unit/stock-order-checkout.test.ts app/\(user\)/checkout/page.tsx
git commit -m "test: cart→stock-order payload 변환 함수 + 단위 테스트"
```

---

### Task 10: 전체 회귀 검증

- [ ] **Step 1: typecheck / test / lint / build**

Run:
```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Expected: 모두 PASS

- [ ] **Step 2: E2E 수동 시나리오 (smoke)**

1. 일반 사용자: `/shop` → 상품 추가 → `/cart` → `/checkout` → 검토 요청
2. 관리자: `/admin/orders` 검토대기 행 확인 → 상세 → 승인
3. 일반 사용자: `/orders` 에서 status="승인"으로 표시되는지
4. Supabase Studio: `user_inventory.quantity` 적립, `inventory_movements` 행 추가, `profiles.deposit_balance` 차감 확인
5. 다른 검토대기 건은 반려 → 차감/적립 없음 확인

Phase 2 완료. Phase 3 (보유 재고 화면 + /deposit·상품카드 표시)으로 진행.
