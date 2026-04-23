import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type OrderStatus } from '@/lib/types';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { OrdersRealtime } from '@/components/OrdersRealtime';
import { StatCard } from '@/components/StatCard';
import {
  ShoppingCart,
  UserCheck,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type RecentOrder = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  created_at: string;
};
type BalanceRow = { deposit_balance: number; low_balance_threshold: number };

export default async function AdminDashboard() {
  const supabase = createClient();
  const [
    { count: newOrders },
    { count: pendingApprovals },
    { count: pendingDeposits },
    { data: recentOrders },
    { data: lbUsers },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'placed'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('deposit_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('orders')
      .select('id,user_id,total_amount,status,created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('profiles').select('deposit_balance,low_balance_threshold').eq('role', 'user'),
  ]);

  const lbList = (lbUsers ?? []) as unknown as BalanceRow[];
  const lowBalanceCount = lbList.filter(
    (p) => Number(p.deposit_balance) <= Number(p.low_balance_threshold),
  ).length;
  const recent = (recentOrders ?? []) as unknown as RecentOrder[];

  return (
    <div className="space-y-6">
      <OrdersRealtime />

      <section aria-label="핵심 지표" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="신규 주문"
          value={newOrders ?? 0}
          href="/admin/orders?status=placed"
          Icon={ShoppingCart}
          hint="접수 대기 중"
        />
        <StatCard
          label="승인 대기"
          value={pendingApprovals ?? 0}
          href="/admin/approvals"
          Icon={UserCheck}
          tone={(pendingApprovals ?? 0) > 0 ? 'warning' : 'default'}
          hint="신규 가입 신청"
        />
        <StatCard
          label="입금 확인"
          value={pendingDeposits ?? 0}
          href="/admin/deposits"
          Icon={Wallet}
          tone={(pendingDeposits ?? 0) > 0 ? 'warning' : 'default'}
          hint="이체 요청"
        />
        <StatCard
          label="잔액 부족 고객"
          value={lowBalanceCount}
          href="/admin/low-balance"
          Icon={AlertTriangle}
          tone={lowBalanceCount > 0 ? 'danger' : 'default'}
          hint="임계치 이하"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-lg border bg-card">
          <header className="flex items-center justify-between px-5 h-14 border-b">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-pulse-dot" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <h2 className="font-heading font-semibold text-[15px]">실시간 주문</h2>
              <span className="text-[11px] text-muted-foreground">최근 10건</span>
            </div>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              전체 보기 <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </header>
          {recent.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              아직 주문이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="font-medium px-5 h-10">주문 번호</th>
                    <th className="font-medium px-3">고객</th>
                    <th className="font-medium px-3 text-right">금액</th>
                    <th className="font-medium px-3">상태</th>
                    <th className="font-medium px-3">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id} className="border-t h-11 hover:bg-surface-muted/50 transition-colors">
                      <td className="px-5">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono text-xs text-accent hover:underline"
                        >
                          {o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 font-mono text-xs text-muted-foreground">
                        {o.user_id.slice(0, 8)}
                      </td>
                      <td className="px-3 text-right font-mono tabular text-sm">
                        {formatKRW(Number(o.total_amount))}
                      </td>
                      <td className="px-3">
                        <OrderStatusBadge status={o.status as OrderStatus} />
                      </td>
                      <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(o.created_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-lg border bg-card">
          <header className="flex items-center justify-between px-5 h-14 border-b">
            <h2 className="font-heading font-semibold text-[15px]">바로가기</h2>
          </header>
          <ul className="p-2">
            {[
              { href: '/admin/approvals', label: '가입 승인', Icon: UserCheck },
              { href: '/admin/deposits', label: '입금 확인', Icon: Wallet },
              { href: '/admin/orders', label: '주문 관리', Icon: ShoppingCart },
              { href: '/admin/low-balance', label: '잔액 부족', Icon: AlertTriangle },
            ].map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center justify-between gap-3 px-3 h-11 rounded-md hover:bg-muted transition-colors group"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {label}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
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
