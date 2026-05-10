import { formatKRW } from '@/lib/money';
import { type OrderStatus, type StockOrderStatus } from '@/lib/types';
import { OrderStatusBadge, StockOrderStatusBadge } from '@/components/StatusBadge';
import { OrderCancelButton } from '@/components/OrderCancelButton';
import { StockOrderCancelButton } from './StockOrderCancelButton';
import { Inbox, Truck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getTrackingUrl, isCjCarrier } from '@/lib/tracking';
import { DeliveryTrackingLookup } from '@/components/DeliveryTrackingLookup';
import { formatDateTimeKR } from '@/lib/dates';
import { fetchMyOrders } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

export default async function MyOrdersPage() {
  const { stockOrders, legacyOrders: legacy } = await fetchMyOrders();

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문 내역</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular font-medium text-foreground">
              {stockOrders.length + legacy.length}
            </span>
            건
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">엑시트몰 상품 (재고 적립)</h2>
        {stockOrders.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">검토 요청 내역이 없습니다</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/shop">상품 보러가기</Link>
            </Button>
          </div>
        ) : (
          stockOrders.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card">
              <header className="flex items-center justify-between gap-3 p-4 border-b">
                <span className="font-mono text-xs text-muted-foreground truncate">
                  주문번호 {o.id.slice(0, 8)} ·{' '}
                  {formatDateTimeKR(o.created_at)}
                </span>
                <StockOrderStatusBadge status={o.status as StockOrderStatus} />
              </header>
              <div className="p-4 space-y-1 text-sm">
                {o.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      <span className="text-foreground">{it.product_name}</span>
                      <span className="text-muted-foreground"> × {it.qty}</span>
                    </span>
                    <span className="font-mono tabular text-muted-foreground">
                      {formatKRW(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
              {o.status === 'rejected' && o.admin_memo && (
                <p className="px-4 pb-3 text-xs text-destructive">반려 사유: {o.admin_memo}</p>
              )}
              <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-surface-muted/40">
                <span className="font-mono tabular text-lg font-semibold">
                  {formatKRW(Number(o.total_amount))}
                </span>
                {o.status === 'pending' && <StockOrderCancelButton orderId={o.id} />}
              </footer>
            </article>
          ))
        )}
      </section>

      {legacy.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading font-semibold text-lg text-muted-foreground">
            Legacy 주문 (구 일반 주문)
          </h2>
          {legacy.map((o) => (
            <article key={o.id} className="rounded-lg border bg-card">
              <header className="flex items-center justify-between gap-3 p-4 border-b">
                <span className="font-mono text-xs text-muted-foreground truncate">
                  주문번호 {o.id.slice(0, 8)} ·{' '}
                  {formatDateTimeKR(o.created_at)}
                </span>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </header>
              <div className="p-4 space-y-1 text-sm">
                {o.order_items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      <span className="text-foreground">{it.product_name}</span>
                      <span className="text-muted-foreground"> × {it.quantity}</span>
                    </span>
                    <span className="font-mono tabular text-muted-foreground">
                      {formatKRW(Number(it.subtotal))}
                    </span>
                  </div>
                ))}
              </div>
              {o.tracking_number && (
                <div className="px-4 pb-3 space-y-2">
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-surface-muted text-xs">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {o.carrier && <span className="text-muted-foreground">{o.carrier}</span>}
                    <span className="font-mono tabular">{o.tracking_number}</span>
                    {(() => {
                      const url = getTrackingUrl(o.carrier, o.tracking_number);
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          조회
                        </a>
                      ) : null;
                    })()}
                  </span>
                  {isCjCarrier(o.carrier) && <DeliveryTrackingLookup orderId={o.id} />}
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
        </section>
      )}
    </div>
  );
}
