import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { OrdersRealtime } from '@/components/OrdersRealtime';
import { cn } from '@/lib/utils';
import { ChevronRight, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'placed', label: '접수' },
  { key: 'preparing', label: '준비중' },
  { key: 'shipped', label: '배송중' },
  { key: 'delivered', label: '완료' },
  { key: 'cancelled', label: '취소' },
];

type OrderRow = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  created_at: string;
  profiles: { name: string } | null;
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = (searchParams.status ?? 'all') as OrderStatus | 'all';

  let q = supabase
    .from('orders')
    .select(
      'id,user_id,total_amount,status,shipping_name,created_at,profiles!orders_user_id_fkey(name)',
    )
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as OrderRow[];

  // Per-tab count for badges
  const { data: allForCounts } = await supabase.from('orders').select('status');
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
      <OrdersRealtime />

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">전체 {counts.all ?? 0}건의 주문</p>
        </div>
      </div>

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
              {status === 'all' ? '주문이 없습니다' : `${ORDER_STATUS_LABEL[status as OrderStatus]} 상태의 주문이 없습니다`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10">주문 번호</th>
                  <th className="font-medium px-3">고객</th>
                  <th className="font-medium px-3">배송지</th>
                  <th className="font-medium px-3 text-right">금액</th>
                  <th className="font-medium px-3">상태</th>
                  <th className="font-medium px-3">주문 시각</th>
                  <th className="font-medium px-3 w-8" aria-label="이동"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t h-11 hover:bg-surface-muted/60 transition-colors">
                    <td className="px-4">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3">{o.profiles?.name ?? <span className="text-muted-foreground font-mono text-xs">{o.user_id.slice(0, 8)}</span>}</td>
                    <td className="px-3 text-muted-foreground truncate max-w-[180px]">{o.shipping_name}</td>
                    <td className="px-3 text-right font-mono tabular">{formatKRW(Number(o.total_amount))}</td>
                    <td className="px-3">
                      <OrderStatusBadge status={o.status as OrderStatus} />
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
