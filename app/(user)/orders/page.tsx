import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { OrderCancelButton } from '@/components/OrderCancelButton';

export const dynamic = 'force-dynamic';

type OrderItem = { product_name: string; quantity: number; unit_price: number; subtotal: number };
type Order = {
  id: string; total_amount: number; status: string; shipping_name: string;
  tracking_number: string | null; carrier: string | null; created_at: string;
  order_items: OrderItem[];
};

export default async function MyOrdersPage() {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('id,total_amount,status,shipping_name,tracking_number,carrier,created_at,order_items(product_name,quantity,unit_price,subtotal)')
    .order('created_at', { ascending: false });

  const list = (orders ?? []) as unknown as Order[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">주문 내역</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">주문 내역이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {list.map(o => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">주문번호 {o.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('ko-KR')}</p>
                  </div>
                  <Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge>
                </div>
                <div className="text-sm">
                  {o.order_items.map((it, i) => (
                    <p key={i}>{it.product_name} × {it.quantity} — {formatKRW(Number(it.subtotal))}</p>
                  ))}
                </div>
                {o.tracking_number && (
                  <p className="text-sm">송장: {o.carrier} {o.tracking_number}</p>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-bold">{formatKRW(Number(o.total_amount))}</span>
                  {o.status === 'placed' && <OrderCancelButton orderId={o.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
