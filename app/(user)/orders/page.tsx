import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/money';
import { type OrderStatus } from '@/lib/types';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { OrderCancelButton } from '@/components/OrderCancelButton';
import { Inbox, Truck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

type OrderItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};
type Order = {
  id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  order_items: OrderItem[];
};

export default async function MyOrdersPage() {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select(
      'id,total_amount,status,shipping_name,tracking_number,carrier,created_at,order_items(product_name,quantity,unit_price,subtotal)',
    )
    .order('created_at', { ascending: false });

  const list = (orders ?? []) as unknown as Order[];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문 내역</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular font-medium text-foreground">{list.length}</span>건
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="font-medium">주문 내역이 없습니다</h2>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link href="/shop">상품 보러가기</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card">
              <header className="flex items-center justify-between gap-3 p-4 border-b">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground truncate">
                    주문번호 {o.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.created_at).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </header>

              <div className="p-4 space-y-2 text-sm">
                {o.order_items.map((it, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-foreground">{it.product_name}</span>
                      <span className="text-muted-foreground"> × {it.quantity}</span>
                    </span>
                    <span className="font-mono tabular text-muted-foreground whitespace-nowrap">
                      {formatKRW(Number(it.subtotal))}
                    </span>
                  </div>
                ))}
              </div>

              {o.tracking_number && (
                <div className="px-4 pb-3">
                  <div className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-surface-muted text-xs">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-muted-foreground">{o.carrier}</span>
                    <span className="font-mono tabular">{o.tracking_number}</span>
                  </div>
                </div>
              )}

              <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-surface-muted/40">
                <span className="font-mono tabular text-lg font-semibold">
                  {formatKRW(Number(o.total_amount))}
                </span>
                {o.status === 'placed' && <OrderCancelButton orderId={o.id} />}
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
