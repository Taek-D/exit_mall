import { type OrderStatus, type StockOrderStatus } from '@/lib/types';
import { OrderStatusBadge, StockOrderStatusBadge } from '@/components/StatusBadge';
import { OrderCancelButton } from '@/components/OrderCancelButton';
import { EmptyState } from '@/components/EmptyState';
import { OrderHistoryCard } from '@/components/orders/OrderHistoryCard';
import { StockOrderCancelButton } from './StockOrderCancelButton';
import { Inbox, Truck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getTrackingUrl, isCjCarrier } from '@/lib/tracking';
import { DeliveryTrackingLookup } from '@/components/DeliveryTrackingLookup';
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
          <EmptyState
            icon={Inbox}
            description="검토 요청 내역이 없습니다"
            className="p-8"
            action={
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/shop">상품 보러가기</Link>
              </Button>
            }
          />
        ) : (
          stockOrders.map((o) => (
            <OrderHistoryCard
              key={o.id}
              id={o.id}
              createdAt={o.created_at}
              statusBadge={<StockOrderStatusBadge status={o.status as StockOrderStatus} />}
              items={o.items.map((item) => ({
                name: item.product_name,
                quantity: item.qty,
                subtotal: item.subtotal,
              }))}
              totalAmount={Number(o.total_amount)}
              footerAction={o.status === 'pending' && <StockOrderCancelButton orderId={o.id} />}
            >
              {o.status === 'rejected' && o.admin_memo && (
                <p className="px-4 pb-3 text-xs text-destructive">반려 사유: {o.admin_memo}</p>
              )}
            </OrderHistoryCard>
          ))
        )}
      </section>

      {legacy.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading font-semibold text-lg text-muted-foreground">
            Legacy 주문 (구 일반 주문)
          </h2>
          {legacy.map((o) => (
            <OrderHistoryCard
              key={o.id}
              id={o.id}
              createdAt={o.created_at}
              statusBadge={<OrderStatusBadge status={o.status as OrderStatus} />}
              items={o.order_items.map((item) => ({
                name: item.product_name,
                quantity: item.quantity,
                subtotal: Number(item.subtotal),
              }))}
              totalAmount={Number(o.total_amount)}
              footerAction={o.status === 'placed' && <OrderCancelButton orderId={o.id} />}
            >
              <TrackingSummary
                orderId={o.id}
                carrier={o.carrier}
                trackingNumber={o.tracking_number}
              />
            </OrderHistoryCard>
          ))}
        </section>
      )}
    </div>
  );
}

function TrackingSummary({
  orderId,
  carrier,
  trackingNumber,
}: {
  orderId: string;
  carrier: string | null;
  trackingNumber: string | null;
}) {
  if (!trackingNumber) return null;

  const trackingUrl = getTrackingUrl(carrier, trackingNumber);

  return (
    <div className="px-4 pb-3 space-y-2">
      <span className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-surface-muted text-xs">
        <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {carrier && <span className="text-muted-foreground">{carrier}</span>}
        <span className="font-mono tabular">{trackingNumber}</span>
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            조회
          </a>
        )}
      </span>
      {isCjCarrier(carrier) && <DeliveryTrackingLookup orderId={orderId} />}
    </div>
  );
}
