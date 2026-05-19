import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { type DepositStatus } from '@/lib/types';
import { DepositStatusBadge } from '@/components/StatusBadge';
import { computeAvailableDeposit } from '@/lib/inventory';
import Link from 'next/link';
import { Wallet, Plus, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Req = {
  id: string;
  amount: number;
  depositor_name: string;
  status: string;
  admin_memo: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export default async function DepositListPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [profileRes, requestsRes, stockPendingRes, shippingPendingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('deposit_balance,low_balance_threshold')
      .eq('id', user!.id)
      .single<{ deposit_balance: number; low_balance_threshold: number }>(),
    supabase
      .from('deposit_requests')
      .select('id,amount,depositor_name,status,admin_memo,created_at,confirmed_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('stock_orders')
      .select('id, total_amount')
      .eq('user_id', user!.id)
      .eq('status', 'pending'),
    supabase
      .from('order_uploads')
      .select('id, shipping_fee_total')
      .eq('user_id', user!.id)
      .eq('status', 'pending')
      .eq('upload_type', 'exitmall'),
  ]);

  const reqs = (requestsRes.data ?? []) as unknown as Req[];
  const balance = Number(profileRes.data?.deposit_balance ?? 0);
  const threshold = Number(profileRes.data?.low_balance_threshold ?? 0);
  const stockPending = (stockPendingRes.data ?? []) as Array<{ id: string; total_amount: number }>;
  const shippingPending = (shippingPendingRes.data ?? []) as Array<{
    id: string;
    shipping_fee_total: number;
  }>;
  const dep = computeAvailableDeposit(
    balance,
    stockPending.map((s) => ({ id: s.id, total_amount: Number(s.total_amount) })),
    shippingPending.map((s) => ({ id: s.id, shipping_fee_total: Number(s.shipping_fee_total ?? 0) })),
  );
  const low = dep.available <= threshold;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">예치금</h1>
      </header>

      <section
        className="rounded-lg border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        aria-label="예치금 잔액"
      >
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-md bg-accent/10 text-accent grid place-items-center">
            <Wallet className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              가용 예치금
            </p>
            <p className="font-mono tabular text-3xl font-semibold mt-1 leading-none">
              {formatKRW(dep.available)}
            </p>
            {(dep.stockReserved > 0 || dep.shippingReserved > 0) && (
              <p className="text-xs text-muted-foreground mt-1.5">
                잔액 <span className="font-mono tabular text-foreground">{formatKRW(dep.balance)}</span> ·
                검토대기 예약{' '}
                <span className="font-mono tabular text-warning">
                  {formatKRW(dep.stockReserved + dep.shippingReserved)}
                </span>
                {dep.stockReserved > 0 && (
                  <span className="ml-1 text-[11px]">(재고 {formatKRW(dep.stockReserved)})</span>
                )}
                {dep.shippingReserved > 0 && (
                  <span className="ml-1 text-[11px]">(배송 {formatKRW(dep.shippingReserved)})</span>
                )}
              </p>
            )}
            {threshold > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                알림 임계치{' '}
                <span className={`font-mono tabular ${low ? 'text-warning font-medium' : ''}`}>
                  {formatKRW(threshold)}
                </span>
              </p>
            )}
          </div>
        </div>
        <Button asChild className="sm:self-center">
          <Link href="/deposit/new">
            <Plus className="h-4 w-4" aria-hidden />
            이체 요청
          </Link>
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">이체 요청 내역</h2>

        {reqs.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">요청 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="font-medium px-4 h-10">요청일시</th>
                    <th className="font-medium px-3 text-right">금액</th>
                    <th className="font-medium px-3">입금자명</th>
                    <th className="font-medium px-3">상태</th>
                    <th className="font-medium px-3">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => (
                    <tr key={r.id} className="border-t h-11 hover:bg-surface-muted/50 transition-colors">
                      <td className="px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 text-right font-mono tabular font-medium">
                        {formatKRW(Number(r.amount))}
                      </td>
                      <td className="px-3">{r.depositor_name}</td>
                      <td className="px-3">
                        <DepositStatusBadge status={r.status as DepositStatus} />
                      </td>
                      <td className="px-3 text-xs text-muted-foreground max-w-[240px] truncate">
                        {r.admin_memo ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
