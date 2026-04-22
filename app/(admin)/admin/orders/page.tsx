import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { OrdersRealtime } from '@/components/OrdersRealtime';

export const dynamic = 'force-dynamic';

const TABS: (OrderStatus | 'all')[] = ['all', 'placed', 'preparing', 'shipped', 'delivered', 'cancelled'];

type OrderRow = {
  id: string; user_id: string; total_amount: number; status: string; shipping_name: string; created_at: string;
  profiles: { name: string } | null;
};

export default async function AdminOrdersPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = createClient();
  const status = (searchParams.status ?? 'all') as OrderStatus | 'all';
  let q = supabase.from('orders').select('id,user_id,total_amount,status,shipping_name,created_at,profiles!orders_user_id_fkey(name)').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as OrderRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">주문 관리</h1>
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <Link key={t} href={`/admin/orders${t === 'all' ? '' : `?status=${t}`}`}>
            <Badge variant={status === t ? 'default' : 'secondary'}>
              {t === 'all' ? '전체' : ORDER_STATUS_LABEL[t]}
            </Badge>
          </Link>
        ))}
      </div>
      <OrdersRealtime />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>
              <th className="text-left p-2">주문번호</th><th className="text-left p-2">사용자</th>
              <th className="text-left p-2">배송지</th>
              <th className="text-right p-2">금액</th><th className="text-left p-2">상태</th><th className="text-left p-2">시간</th>
            </tr></thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} className="border-t">
                  <td className="p-2"><Link href={`/admin/orders/${o.id}`} className="underline">{o.id.slice(0,8)}</Link></td>
                  <td className="p-2">{o.profiles?.name ?? o.user_id.slice(0,8)}</td>
                  <td className="p-2">{o.shipping_name}</td>
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
  );
}
