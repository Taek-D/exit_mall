import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { TransitionButtons } from './TransitionButtons';

export const dynamic = 'force-dynamic';

type Order = {
  id: string; total_amount: number; status: string;
  shipping_name: string; shipping_phone: string; shipping_address: string; shipping_memo: string | null;
  tracking_number: string | null; carrier: string | null;
  order_items: { id: string; product_name: string; quantity: number; subtotal: number }[];
  profiles: { name: string; email: string; phone: string } | null;
};

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase.from('orders')
    .select('*,order_items(*),profiles!orders_user_id_fkey(name,email,phone)')
    .eq('id', params.id).single<Order>();
  if (!order) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문 상세</h1>
        <Badge>{ORDER_STATUS_LABEL[order.status as OrderStatus]}</Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">주문자</h2>
          <p>{order.profiles?.name} ({order.profiles?.email})</p>
          <p className="text-sm text-muted-foreground">{order.profiles?.phone}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">배송 정보</h2>
          <p>받는 사람: {order.shipping_name}</p>
          <p>연락처: {order.shipping_phone}</p>
          <p>주소: {order.shipping_address}</p>
          {order.shipping_memo && <p className="text-sm">메모: {order.shipping_memo}</p>}
          {order.tracking_number && <p className="text-sm mt-2">송장: {order.carrier} {order.tracking_number}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">주문 항목</h2>
          {order.order_items.map(it => (
            <div key={it.id} className="flex justify-between text-sm">
              <span>{it.product_name} × {it.quantity}</span>
              <span>{formatKRW(Number(it.subtotal))}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>합계</span><span>{formatKRW(Number(order.total_amount))}</span>
          </div>
        </CardContent>
      </Card>

      <TransitionButtons orderId={order.id} status={order.status as OrderStatus} />
    </div>
  );
}
