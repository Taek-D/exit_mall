# Admin Unified Operations Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy-order-centered admin home with a unified operations dashboard for approvals, deposits, stock orders, shipping uploads, inbound requests, and CS requests.

**Architecture:** Add a server-side dashboard data module under `lib/admin/dashboard.ts` that separates pure normalization helpers from Supabase fetching. Keep `/admin/page.tsx` focused on rendering cards and a recent activity table, and extend realtime subscriptions so the dashboard refreshes when any included workflow changes.

**Tech Stack:** Next.js App Router, React Server Components, Supabase server/browser clients, TypeScript, Vitest, Tailwind CSS, lucide-react.

---

## File Structure

- Create: `lib/admin/dashboard.ts`
  - Owns dashboard types, queue definitions, pure normalization helpers, recent activity sorting, and the server fetcher.
- Create: `tests/unit/admin-dashboard.test.ts`
  - Verifies queue ordering, count/tone/link rules, secondary counts, and recent activity sorting/limiting.
- Modify: `components/StatCard.tsx`
  - Adds an optional secondary hint line while keeping existing usages working.
- Modify: `components/OrdersRealtime.tsx`
  - Subscribes to all dashboard workflow tables, not only `stock_orders` and `order_uploads`.
- Replace: `app/(admin)/admin/page.tsx`
  - Uses `fetchAdminDashboardData()` and renders the unified dashboard.

---

### Task 1: Add Dashboard Normalization Helpers

**Files:**
- Create: `tests/unit/admin-dashboard.test.ts`
- Create: `lib/admin/dashboard.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-dashboard.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildRecentActivities,
  buildWorkQueues,
  limitRecentActivities,
  type RawDashboardActivity,
} from '@/lib/admin/dashboard';

describe('admin dashboard work queues', () => {
  it('builds the fixed queue order with matching filter links', () => {
    const queues = buildWorkQueues({
      pendingApprovals: 1,
      pendingDeposits: 2,
      pendingStockOrders: 3,
      pendingExitmallUploads: 4,
      pendingPurchasedUploads: 5,
      openInboundRequests: 6,
      unreadInboundRequests: 7,
      openSupportRequests: 8,
      unreadSupportRequests: 9,
    });

    expect(queues.map((q) => q.key)).toEqual([
      'approvals',
      'deposits',
      'stock-orders',
      'exitmall-shipping',
      'purchased-shipping',
      'inbound-requests',
      'support-requests',
    ]);
    expect(queues.map((q) => q.href)).toEqual([
      '/admin/approvals',
      '/admin/deposits',
      '/admin/orders?status=pending',
      '/admin/shipping-uploads/exitmall?status=pending',
      '/admin/shipping-uploads/purchased?status=pending',
      '/admin/inbound-requests?status=open',
      '/admin/support-requests?status=open',
    ]);
  });

  it('uses warning tone when primary or secondary count needs attention', () => {
    const [approvals, deposits, stock, exitmall, purchased, inbound, support] =
      buildWorkQueues({
        pendingApprovals: 0,
        pendingDeposits: 0,
        pendingStockOrders: 0,
        pendingExitmallUploads: 0,
        pendingPurchasedUploads: 0,
        openInboundRequests: 0,
        unreadInboundRequests: 2,
        openSupportRequests: 0,
        unreadSupportRequests: 0,
      });

    expect(approvals.tone).toBe('default');
    expect(deposits.tone).toBe('default');
    expect(stock.tone).toBe('default');
    expect(exitmall.tone).toBe('default');
    expect(purchased.tone).toBe('default');
    expect(inbound.tone).toBe('warning');
    expect(inbound.secondaryCount).toBe(2);
    expect(inbound.secondaryLabel).toBe('미확인 답변');
    expect(support.tone).toBe('default');
  });

  it('sums primary pending and unread attention counts separately', () => {
    const queues = buildWorkQueues({
      pendingApprovals: 1,
      pendingDeposits: 2,
      pendingStockOrders: 3,
      pendingExitmallUploads: 4,
      pendingPurchasedUploads: 5,
      openInboundRequests: 6,
      unreadInboundRequests: 7,
      openSupportRequests: 8,
      unreadSupportRequests: 9,
    });

    const totalPending = queues.reduce((sum, q) => sum + q.count, 0);
    const unreadAttention = queues.reduce((sum, q) => sum + (q.secondaryCount ?? 0), 0);

    expect(totalPending).toBe(29);
    expect(unreadAttention).toBe(16);
  });
});

describe('admin dashboard recent activities', () => {
  it('normalizes and sorts activities by occurredAt descending', () => {
    const raw: RawDashboardActivity[] = [
      {
        id: 'old-stock',
        type: '구매 승인',
        title: '오래된 구매 요청',
        customerName: '김고객',
        statusLabel: '검토대기',
        occurredAt: '2026-05-22T02:00:00.000Z',
        href: '/admin/orders/old-stock',
      },
      {
        id: 'new-cs',
        type: 'CS 문의',
        title: '새 CS 댓글',
        customerName: '이고객',
        statusLabel: '접수',
        occurredAt: '2026-05-22T04:00:00.000Z',
        href: '/admin/support-requests/new-cs',
      },
      {
        id: 'mid-upload',
        type: '엑시트몰 배송대행',
        title: '배송 업로드.xlsx',
        customerName: null,
        statusLabel: '검토대기',
        occurredAt: '2026-05-22T03:00:00.000Z',
        href: '/admin/shipping-uploads/exitmall/mid-upload',
      },
    ];

    expect(buildRecentActivities(raw).map((a) => a.id)).toEqual([
      'new-cs',
      'mid-upload',
      'old-stock',
    ]);
  });

  it('drops activities without a usable occurredAt and limits the result', () => {
    const raw: RawDashboardActivity[] = Array.from({ length: 17 }, (_, index) => ({
      id: `activity-${index}`,
      type: '구매 승인',
      title: `요청 ${index}`,
      customerName: null,
      statusLabel: '검토대기',
      occurredAt: `2026-05-22T${String(index).padStart(2, '0')}:00:00.000Z`,
      href: `/admin/orders/activity-${index}`,
    }));
    raw.push({
      id: 'bad-date',
      type: 'CS 문의',
      title: '날짜 없음',
      customerName: null,
      statusLabel: '접수',
      occurredAt: '',
      href: '/admin/support-requests/bad-date',
    });

    const limited = limitRecentActivities(buildRecentActivities(raw), 15);

    expect(limited).toHaveLength(15);
    expect(limited[0]?.id).toBe('activity-16');
    expect(limited.some((a) => a.id === 'bad-date')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/unit/admin-dashboard.test.ts
```

Expected: FAIL because `@/lib/admin/dashboard` does not exist.

- [ ] **Step 3: Add the normalization module**

Create `lib/admin/dashboard.ts` with this initial content:

```ts
export type AdminDashboardIconKey =
  | 'user-check'
  | 'wallet'
  | 'shopping-cart'
  | 'file-spreadsheet'
  | 'inbox'
  | 'life-buoy';

export type AdminWorkQueue = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: 'default' | 'warning' | 'danger';
  icon: AdminDashboardIconKey;
  secondaryCount?: number;
  secondaryLabel?: string;
};

export type AdminRecentActivity = {
  id: string;
  type: string;
  title: string;
  customerName: string | null;
  statusLabel: string;
  occurredAt: string;
  href: string;
};

export type RawDashboardActivity = AdminRecentActivity;

export type AdminDashboardCounts = {
  pendingApprovals: number;
  pendingDeposits: number;
  pendingStockOrders: number;
  pendingExitmallUploads: number;
  pendingPurchasedUploads: number;
  openInboundRequests: number;
  unreadInboundRequests: number;
  openSupportRequests: number;
  unreadSupportRequests: number;
};

export type AdminDashboardData = {
  totalPendingCount: number;
  unreadAttentionCount: number;
  workQueues: AdminWorkQueue[];
  recentActivities: AdminRecentActivity[];
};

function queueTone(count: number, secondaryCount = 0): AdminWorkQueue['tone'] {
  return count > 0 || secondaryCount > 0 ? 'warning' : 'default';
}

export function buildWorkQueues(counts: AdminDashboardCounts): AdminWorkQueue[] {
  return [
    {
      key: 'approvals',
      label: '가입 승인',
      description: '신규 회원 승인 대기',
      count: counts.pendingApprovals,
      href: '/admin/approvals',
      tone: queueTone(counts.pendingApprovals),
      icon: 'user-check',
    },
    {
      key: 'deposits',
      label: '입금 확인',
      description: '예치금 이체 요청',
      count: counts.pendingDeposits,
      href: '/admin/deposits',
      tone: queueTone(counts.pendingDeposits),
      icon: 'wallet',
    },
    {
      key: 'stock-orders',
      label: '구매 승인',
      description: '엑시트몰 상품 구매 검토',
      count: counts.pendingStockOrders,
      href: '/admin/orders?status=pending',
      tone: queueTone(counts.pendingStockOrders),
      icon: 'shopping-cart',
    },
    {
      key: 'exitmall-shipping',
      label: '엑시트몰 배송대행',
      description: '배송대행 업로드 검토',
      count: counts.pendingExitmallUploads,
      href: '/admin/shipping-uploads/exitmall?status=pending',
      tone: queueTone(counts.pendingExitmallUploads),
      icon: 'file-spreadsheet',
    },
    {
      key: 'purchased-shipping',
      label: '사입재고 배송대행',
      description: '사입재고 배송 요청 검토',
      count: counts.pendingPurchasedUploads,
      href: '/admin/shipping-uploads/purchased?status=pending',
      tone: queueTone(counts.pendingPurchasedUploads),
      icon: 'file-spreadsheet',
    },
    {
      key: 'inbound-requests',
      label: '입고리스트',
      description: '신규 입고요청 접수',
      count: counts.openInboundRequests,
      href: '/admin/inbound-requests?status=open',
      tone: queueTone(counts.openInboundRequests, counts.unreadInboundRequests),
      icon: 'inbox',
      secondaryCount: counts.unreadInboundRequests,
      secondaryLabel: '미확인 답변',
    },
    {
      key: 'support-requests',
      label: 'CS 문의',
      description: '교환/반품 및 고객 문의',
      count: counts.openSupportRequests,
      href: '/admin/support-requests?status=open',
      tone: queueTone(counts.openSupportRequests, counts.unreadSupportRequests),
      icon: 'life-buoy',
      secondaryCount: counts.unreadSupportRequests,
      secondaryLabel: '미확인 댓글',
    },
  ];
}

export function buildRecentActivities(rows: RawDashboardActivity[]): AdminRecentActivity[] {
  return rows
    .filter((row) => row.occurredAt && !Number.isNaN(Date.parse(row.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function limitRecentActivities(
  rows: AdminRecentActivity[],
  limit = 15,
): AdminRecentActivity[] {
  return rows.slice(0, limit);
}

export function composeDashboardData(
  counts: AdminDashboardCounts,
  activities: RawDashboardActivity[],
): AdminDashboardData {
  const workQueues = buildWorkQueues(counts);
  return {
    totalPendingCount: workQueues.reduce((sum, queue) => sum + queue.count, 0),
    unreadAttentionCount: workQueues.reduce(
      (sum, queue) => sum + (queue.secondaryCount ?? 0),
      0,
    ),
    workQueues,
    recentActivities: limitRecentActivities(buildRecentActivities(activities), 15),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm test tests/unit/admin-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/dashboard.ts tests/unit/admin-dashboard.test.ts
git commit -m "Add admin dashboard normalization helpers"
```

---

### Task 2: Add Supabase Dashboard Fetching

**Files:**
- Modify: `lib/admin/dashboard.ts`

- [ ] **Step 1: Add server fetch imports and status labels**

Modify the top of `lib/admin/dashboard.ts` so it starts with:

```ts
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/actions/_shared';
import {
  INBOUND_STATUS_LABEL,
  SHIPPING_UPLOAD_STATUS_LABEL,
  STOCK_ORDER_STATUS_LABEL,
  SUPPORT_STATUS_LABEL,
  type InboundStatus,
  type ShippingUploadStatus,
  type StockOrderStatus,
  type SupportStatus,
} from '@/lib/types';
```

Keep the existing exported types below these imports.

- [ ] **Step 2: Append dashboard fetch support types and helpers**

Append this code to the end of `lib/admin/dashboard.ts`:

```ts
type QueryResult = {
  data: unknown[] | null;
  count?: number | null;
  error: { message?: string } | null;
};

type RpcNumberResult = {
  data: number | null;
  error: { message?: string } | null;
};

type ProfileActivityRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  created_at: string;
};

type DepositActivityRow = {
  id: string;
  amount: number;
  depositor_name: string | null;
  status: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

type StockOrderActivityRow = {
  id: string;
  status: StockOrderStatus;
  total_amount: number;
  created_at: string;
  profiles: { name: string | null } | null;
};

type UploadActivityRow = {
  id: string;
  upload_type: 'exitmall' | 'purchased';
  original_name: string;
  status: ShippingUploadStatus;
  total_quantity: number;
  created_at: string;
  profiles: { name: string | null } | null;
};

type InboundActivityRow = {
  id: string;
  title: string;
  status: InboundStatus;
  last_comment_at: string | null;
  updated_at: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

type SupportActivityRow = {
  id: string;
  title: string;
  status: SupportStatus;
  last_comment_at: string | null;
  updated_at: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

function logDashboardError(label: string, error: unknown) {
  console.error(`[admin-dashboard] ${label}`, error);
}

async function safeCount(label: string, query: PromiseLike<QueryResult>): Promise<number> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return 0;
  }
  return result.count ?? 0;
}

async function safeRpcNumber(label: string, query: PromiseLike<RpcNumberResult>): Promise<number> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return 0;
  }
  return Number(result.data) || 0;
}

async function safeRows<T>(label: string, query: PromiseLike<QueryResult>): Promise<T[]> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return [];
  }
  return (result.data ?? []) as T[];
}

function displayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function occurredAt(...values: Array<string | null | undefined>): string {
  return values.find((value) => value && !Number.isNaN(Date.parse(value))) ?? '';
}

function profileActivities(rows: ProfileActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `profile-${row.id}`,
    type: '가입 승인',
    title: displayName(row.name) ?? row.email ?? '신규 가입 요청',
    customerName: displayName(row.name),
    statusLabel: '승인대기',
    occurredAt: row.created_at,
    href: '/admin/approvals',
  }));
}

function depositActivities(rows: DepositActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `deposit-${row.id}`,
    type: '입금 확인',
    title: `${Number(row.amount).toLocaleString('ko-KR')}원 입금 요청`,
    customerName: displayName(row.profiles?.name) ?? displayName(row.depositor_name),
    statusLabel: '승인대기',
    occurredAt: row.created_at,
    href: '/admin/deposits',
  }));
}

function stockOrderActivities(rows: StockOrderActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `stock-order-${row.id}`,
    type: '구매 승인',
    title: `${Number(row.total_amount).toLocaleString('ko-KR')}원 구매 요청`,
    customerName: displayName(row.profiles?.name),
    statusLabel: STOCK_ORDER_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: row.created_at,
    href: `/admin/orders/${row.id}`,
  }));
}

function uploadActivities(rows: UploadActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => {
    const baseHref =
      row.upload_type === 'purchased'
        ? '/admin/shipping-uploads/purchased'
        : '/admin/shipping-uploads/exitmall';
    return {
      id: `upload-${row.id}`,
      type: row.upload_type === 'purchased' ? '사입재고 배송대행' : '엑시트몰 배송대행',
      title: row.original_name,
      customerName: displayName(row.profiles?.name),
      statusLabel: SHIPPING_UPLOAD_STATUS_LABEL[row.status] ?? row.status,
      occurredAt: row.created_at,
      href: `${baseHref}/${row.id}`,
    };
  });
}

function inboundActivities(rows: InboundActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `inbound-${row.id}`,
    type: '입고리스트',
    title: row.title,
    customerName: displayName(row.profiles?.name),
    statusLabel: INBOUND_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: occurredAt(row.last_comment_at, row.updated_at, row.created_at),
    href: `/admin/inbound-requests/${row.id}`,
  }));
}

function supportActivities(rows: SupportActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `support-${row.id}`,
    type: 'CS 문의',
    title: row.title,
    customerName: displayName(row.profiles?.name),
    statusLabel: SUPPORT_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: occurredAt(row.last_comment_at, row.updated_at, row.created_at),
    href: `/admin/support-requests/${row.id}`,
  }));
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createClient();

  const [
    pendingApprovals,
    pendingDeposits,
    pendingStockOrders,
    pendingExitmallUploads,
    pendingPurchasedUploads,
    openInboundRequests,
    unreadInboundRequests,
    openSupportRequests,
    unreadSupportRequests,
    profiles,
    deposits,
    stockOrders,
    uploads,
    inbound,
    support,
  ] = await Promise.all([
    safeCount(
      'pending approvals count',
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ),
    safeCount(
      'pending deposits count',
      supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending stock orders count',
      supabase
        .from('stock_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending exitmall uploads count',
      supabase
        .from('order_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('upload_type', 'exitmall')
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending purchased uploads count',
      supabase
        .from('order_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('upload_type', 'purchased')
        .eq('status', 'pending'),
    ),
    safeCount(
      'open inbound requests count',
      supabase
        .from('inbound_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ),
    safeRpcNumber(
      'unread inbound requests count',
      callRpc(supabase, 'count_inbound_unread', { p_role: 'admin' }),
    ),
    safeCount(
      'open support requests count',
      supabase
        .from('support_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ),
    safeRpcNumber(
      'unread support requests count',
      callRpc(supabase, 'count_support_unread', { p_role: 'admin' }),
    ),
    safeRows<ProfileActivityRow>(
      'recent pending approvals',
      supabase
        .from('profiles')
        .select('id,name,email,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<DepositActivityRow>(
      'recent pending deposits',
      supabase
        .from('deposit_requests')
        .select(
          'id,amount,depositor_name,status,created_at,profiles:profiles!deposit_requests_user_id_fkey(name)',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<StockOrderActivityRow>(
      'recent stock orders',
      supabase
        .from('stock_orders')
        .select('id,status,total_amount,created_at,profiles!stock_orders_user_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<UploadActivityRow>(
      'recent shipping uploads',
      supabase
        .from('order_uploads')
        .select(
          'id,upload_type,original_name,status,total_quantity,created_at,profiles!order_uploads_user_id_fkey(name)',
        )
        .in('upload_type', ['exitmall', 'purchased'])
        .order('created_at', { ascending: false })
        .limit(10),
    ),
    safeRows<InboundActivityRow>(
      'recent inbound requests',
      supabase
        .from('inbound_requests')
        .select('id,title,status,last_comment_at,updated_at,created_at,profiles!inbound_requests_user_id_fkey(name)')
        .order('updated_at', { ascending: false })
        .limit(5),
    ),
    safeRows<SupportActivityRow>(
      'recent support requests',
      supabase
        .from('support_requests')
        .select('id,title,status,last_comment_at,updated_at,created_at,profiles!support_requests_user_id_fkey(name)')
        .order('updated_at', { ascending: false })
        .limit(5),
    ),
  ]);

  return composeDashboardData(
    {
      pendingApprovals,
      pendingDeposits,
      pendingStockOrders,
      pendingExitmallUploads,
      pendingPurchasedUploads,
      openInboundRequests,
      unreadInboundRequests,
      openSupportRequests,
      unreadSupportRequests,
    },
    [
      ...profileActivities(profiles),
      ...depositActivities(deposits),
      ...stockOrderActivities(stockOrders),
      ...uploadActivities(uploads),
      ...inboundActivities(inbound),
      ...supportActivities(support),
    ],
  );
}
```

- [ ] **Step 3: Typecheck the server fetcher**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run dashboard unit tests**

Run:

```bash
pnpm test tests/unit/admin-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/dashboard.ts tests/unit/admin-dashboard.test.ts
git commit -m "Fetch unified admin dashboard data"
```

---

### Task 3: Extend StatCard for Secondary Counts

**Files:**
- Modify: `components/StatCard.tsx`

- [ ] **Step 1: Update the component props**

In `components/StatCard.tsx`, replace the `Props` type with:

```ts
type Props = {
  label: string;
  value: string | number;
  href?: string;
  Icon?: LucideIcon;
  tone?: 'default' | 'warning' | 'danger';
  hint?: string;
  secondaryHint?: string;
};
```

- [ ] **Step 2: Render the secondary hint**

Change the function signature and hint block to:

```tsx
export function StatCard({
  label,
  value,
  href,
  Icon,
  tone = 'default',
  hint,
  secondaryHint,
}: Props) {
```

Then replace:

```tsx
{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
```

with:

```tsx
<div className="space-y-1">
  {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  {secondaryHint && (
    <p className="text-xs font-medium text-warning">{secondaryHint}</p>
  )}
</div>
```

- [ ] **Step 3: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/StatCard.tsx
git commit -m "Support secondary admin stat hints"
```

---

### Task 4: Replace the Admin Home UI

**Files:**
- Replace: `app/(admin)/admin/page.tsx`

- [ ] **Step 1: Replace the page implementation**

Replace `app/(admin)/admin/page.tsx` with:

```tsx
import Link from 'next/link';
import {
  ArrowRight,
  FileSpreadsheet,
  Inbox,
  LifeBuoy,
  ShoppingCart,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { OrdersRealtime } from '@/components/OrdersRealtime';
import { StatCard } from '@/components/StatCard';
import {
  fetchAdminDashboardData,
  type AdminDashboardIconKey,
} from '@/lib/admin/dashboard';
import { formatShortDateTimeKR } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const ICONS: Record<AdminDashboardIconKey, LucideIcon> = {
  'user-check': UserCheck,
  wallet: Wallet,
  'shopping-cart': ShoppingCart,
  'file-spreadsheet': FileSpreadsheet,
  inbox: Inbox,
  'life-buoy': LifeBuoy,
};

const QUICK_LINKS = [
  { href: '/admin/approvals', label: '가입 승인', Icon: UserCheck },
  { href: '/admin/deposits', label: '입금 확인', Icon: Wallet },
  { href: '/admin/orders?status=pending', label: '구매 승인', Icon: ShoppingCart },
  {
    href: '/admin/shipping-uploads/exitmall?status=pending',
    label: '엑시트몰 배송대행',
    Icon: FileSpreadsheet,
  },
  {
    href: '/admin/shipping-uploads/purchased?status=pending',
    label: '사입재고 배송대행',
    Icon: FileSpreadsheet,
  },
  { href: '/admin/inbound-requests?status=open', label: '입고리스트', Icon: Inbox },
  { href: '/admin/support-requests?status=open', label: 'CS 문의', Icon: LifeBuoy },
];

export default async function AdminDashboard() {
  const dashboard = await fetchAdminDashboardData();

  return (
    <div className="space-y-6">
      <OrdersRealtime />

      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          관리자 대시보드
        </h1>
        <p className="text-sm text-muted-foreground">
          대기 업무 {dashboard.totalPendingCount.toLocaleString('ko-KR')}건
          {dashboard.unreadAttentionCount > 0 && (
            <>
              {' · '}
              미확인 답변 {dashboard.unreadAttentionCount.toLocaleString('ko-KR')}건
            </>
          )}
        </p>
      </header>

      <section aria-label="오늘 처리할 일" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">오늘 처리할 일</h2>
          <span className="text-xs text-muted-foreground">현재 대기 총량 기준</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.workQueues.map((queue) => {
            const Icon = ICONS[queue.icon];
            const secondaryHint =
              queue.secondaryCount && queue.secondaryCount > 0
                ? `${queue.secondaryLabel} ${queue.secondaryCount.toLocaleString('ko-KR')}건`
                : undefined;
            return (
              <StatCard
                key={queue.key}
                label={queue.label}
                value={queue.count}
                href={queue.href}
                Icon={Icon}
                tone={queue.tone}
                hint={queue.description}
                secondaryHint={secondaryHint}
              />
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-lg border bg-card">
          <header className="flex h-14 items-center justify-between border-b px-5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <h2 className="font-heading text-[15px] font-semibold">최근 업무 이벤트</h2>
              <span className="text-[11px] text-muted-foreground">최근 15건</span>
            </div>
          </header>

          {dashboard.recentActivities.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              최근 업무 이벤트가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="h-10 px-5 font-medium">업무</th>
                    <th className="px-3 font-medium">내용</th>
                    <th className="px-3 font-medium">고객</th>
                    <th className="px-3 font-medium">상태</th>
                    <th className="px-3 font-medium">시간</th>
                    <th className="w-8 px-3" aria-label="이동" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentActivities.map((activity) => (
                    <tr
                      key={activity.id}
                      className="h-11 border-t transition-colors hover:bg-surface-muted/60"
                    >
                      <td className="whitespace-nowrap px-5 text-xs font-medium">
                        {activity.type}
                      </td>
                      <td className="max-w-[260px] truncate px-3">
                        <Link href={activity.href} className="hover:underline">
                          {activity.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 text-muted-foreground">
                        {activity.customerName ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 text-muted-foreground">
                        {activity.statusLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 text-xs text-muted-foreground">
                        {formatShortDateTimeKR(activity.occurredAt)}
                      </td>
                      <td className="px-3 text-right">
                        <Link
                          href={activity.href}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="상세 보기"
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-lg border bg-card">
          <header className="flex h-14 items-center justify-between border-b px-5">
            <h2 className="font-heading text-[15px] font-semibold">빠른 이동</h2>
          </header>
          <ul className="p-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-11 items-center justify-between gap-3 rounded-md px-3 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {label}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm test tests/unit/admin-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/page.tsx" components/StatCard.tsx lib/admin/dashboard.ts tests/unit/admin-dashboard.test.ts
git commit -m "Render unified admin operations dashboard"
```

---

### Task 5: Extend Dashboard Realtime Refresh

**Files:**
- Modify: `components/OrdersRealtime.tsx`

- [ ] **Step 1: Replace realtime component implementation**

Replace `components/OrdersRealtime.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/hooks/use-toast';

const DASHBOARD_TABLES = [
  'stock_orders',
  'order_uploads',
  'profiles',
  'deposit_requests',
  'inbound_requests',
  'support_requests',
] as const;

export function OrdersRealtime() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel('admin-dashboard-events');

    DASHBOARD_TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (table === 'stock_orders') {
              toast({
                title: '구매 요청',
                description: '구매 승인 대기 목록에 새 요청이 추가되었습니다.',
              });
            }
            if (table === 'order_uploads') {
              toast({
                title: '배송대행 업로드',
                description: '검토할 배송대행 업로드가 추가되었습니다.',
              });
            }
          }
          router.refresh();
        },
      );
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, toast]);

  return null;
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/OrdersRealtime.tsx
git commit -m "Refresh admin dashboard for all workflow events"
```

---

### Task 6: Full Verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run unit tests**

Run:

```bash
pnpm test tests/unit/admin-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS or only pre-existing warnings unrelated to these files.

- [ ] **Step 4: Run the app locally**

Run:

```bash
pnpm dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 5: Manually verify `/admin`**

Open `http://localhost:3000/admin` while signed in as an admin. Verify:

- The heading reads `관리자 대시보드`.
- The summary line shows 대기 업무 count and optional 미확인 답변 count.
- The seven work queue cards are visible in the expected order.
- Each card navigates to its filter page.
- Recent 업무 이벤트 shows mixed workflows and no legacy `orders` rows.
- 빠른 이동 does not include `Legacy 주문`.

- [ ] **Step 6: Commit verification fixes when files changed**

When verification required file changes, commit them:

```bash
git add "app/(admin)/admin/page.tsx" components/OrdersRealtime.tsx components/StatCard.tsx lib/admin/dashboard.ts tests/unit/admin-dashboard.test.ts
git commit -m "Polish admin dashboard verification fixes"
```

When verification did not change files, do not create an empty commit.
