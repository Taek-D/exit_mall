import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { OrdersRealtime } from '@/components/OrdersRealtime';

export const dynamic = 'force-dynamic';

type RecentOrder = { id: string; user_id: string; total_amount: number; status: string; created_at: string };
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
    supabase.from('orders').select('id,user_id,total_amount,status,created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('deposit_balance,low_balance_threshold').eq('role', 'user'),
  ]);

  const lbList = (lbUsers ?? []) as unknown as BalanceRow[];
  const lowBalanceCount = lbList.filter(p => Number(p.deposit_balance) <= Number(p.low_balance_threshold)).length;
  const recent = (recentOrders ?? []) as unknown as RecentOrder[];

  const widgets = [
    { label: '신규 주문', value: newOrders ?? 0, href: '/admin/orders?status=placed' },
    { label: '승인 대기', value: pendingApprovals ?? 0, href: '/admin/approvals' },
    { label: '입금 확인 대기', value: pendingDeposits ?? 0, href: '/admin/deposits' },
    { label: '잔액 부족 고객', value: lowBalanceCount, href: '/admin/low-balance' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <OrdersRealtime />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {widgets.map(w => (
          <Link key={w.label} href={w.href}>
            <Card className="hover:bg-muted transition">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{w.label}</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{w.value}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-semibold mb-2">최근 주문</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="text-left p-2">주문번호</th><th className="text-left p-2">사용자</th>
                <th className="text-right p-2">금액</th><th className="text-left p-2">상태</th><th className="text-left p-2">시간</th>
              </tr></thead>
              <tbody>
                {recent.map(o => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2"><Link href={`/admin/orders/${o.id}`} className="underline">{o.id.slice(0,8)}</Link></td>
                    <td className="p-2">{o.user_id.slice(0,8)}</td>
                    <td className="p-2 text-right">{formatKRW(Number(o.total_amount))}</td>
                    <td className="p-2"><Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge></td>
                    <td className="p-2">{new Date(o.created_at).toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
