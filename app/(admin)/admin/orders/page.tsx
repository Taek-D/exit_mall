import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusTabs, type StatusTab } from '@/components/StatusTabs';
import { formatKRW } from '@/lib/money';
import { type StockOrderStatus, STOCK_ORDER_STATUS_LABEL } from '@/lib/types';
import { StockOrderStatusBadge } from '@/components/StatusBadge';
import { OrdersRealtime } from '@/components/OrdersRealtime';
import { formatDateTimeKR } from '@/lib/dates';
import { fetchAdminStockOrders, summarizeStockItems } from '@/lib/orders/queries';
import { ChevronRight, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: StatusTab<StockOrderStatus | 'all'>[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'cancelled', label: '취소' },
];

export default async function AdminStockOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = (searchParams.status ?? 'all') as StockOrderStatus | 'all';
  const { rows, counts } = await fetchAdminStockOrders(status);

  return (
    <div className="space-y-5">
      <OrdersRealtime />

      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            엑시트몰 상품 구매 검토 — 전체 {counts.all ?? 0}건 · 검토대기 {counts.pending ?? 0}건
          </p>
        </div>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <StatusTabs
          tabs={TABS}
          active={status}
          counts={counts}
          hrefFor={(key) => `/admin/orders${key === 'all' ? '' : `?status=${key}`}`}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              status === 'all'
                ? '주문이 없습니다'
                : `${STOCK_ORDER_STATUS_LABEL[status as StockOrderStatus]} 상태의 주문이 없습니다`
            }
            className="border-0 rounded-none p-16"
            iconClassName="h-5 w-5"
          />
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
                  const summary = summarizeStockItems(o.items);
                  return (
                    <tr
                      key={o.id}
                      className="border-t h-11 hover:bg-surface-muted/60 transition-colors"
                    >
                      <td className="px-4">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono text-xs text-accent hover:underline"
                        >
                          {o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3">
                        {o.profiles?.name ?? (
                          <span className="text-muted-foreground font-mono text-xs">
                            {o.user_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-muted-foreground truncate max-w-[240px]">
                        {summary}
                      </td>
                      <td className="px-3 text-right font-mono tabular">
                        {formatKRW(Number(o.total_amount))}
                      </td>
                      <td className="px-3">
                        <StockOrderStatusBadge status={o.status as StockOrderStatus} />
                      </td>
                      <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTimeKR(o.created_at)}
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
