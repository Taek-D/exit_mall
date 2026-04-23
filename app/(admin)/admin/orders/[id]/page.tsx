import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type OrderStatus } from '@/lib/types';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { TransitionButtons } from './TransitionButtons';
import { ArrowLeft, User, MapPin, Truck, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Order = {
  id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_memo: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  order_items: { id: string; product_name: string; quantity: number; subtotal: number }[];
  profiles: { name: string; email: string; phone: string } | null;
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: order } = await supabase
    .from('orders')
    .select('*,order_items(*),profiles!orders_user_id_fkey(name,email,phone)')
    .eq('id', params.id)
    .single<Order>();
  if (!order) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        주문 목록
      </Link>

      <header className="pb-4 border-b flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">
            주문 상세
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular">{order.id.slice(0, 8)}</span> ·{' '}
            {order.created_at &&
              new Date(order.created_at).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
          </p>
        </div>
        <OrderStatusBadge status={order.status as OrderStatus} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="주문자" Icon={User}>
          <dl className="space-y-2 text-sm">
            <Row label="이름">{order.profiles?.name ?? '—'}</Row>
            <Row label="이메일" mono>
              {order.profiles?.email ?? '—'}
            </Row>
            <Row label="연락처" mono>
              {order.profiles?.phone ?? '—'}
            </Row>
          </dl>
        </Panel>

        <Panel title="배송 정보" Icon={MapPin}>
          <dl className="space-y-2 text-sm">
            <Row label="받는 사람">{order.shipping_name}</Row>
            <Row label="연락처" mono>
              {order.shipping_phone}
            </Row>
            <Row label="주소">{order.shipping_address}</Row>
            {order.shipping_memo && <Row label="메모">{order.shipping_memo}</Row>}
          </dl>
        </Panel>

        <Panel title="배송 정보" Icon={Truck}>
          {order.tracking_number ? (
            <dl className="space-y-2 text-sm">
              <Row label="택배사">{order.carrier}</Row>
              <Row label="송장번호" mono>
                {order.tracking_number}
              </Row>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">송장번호가 입력되지 않았습니다.</p>
          )}
        </Panel>
      </div>

      <Panel title="주문 항목" Icon={Package}>
        <ul className="divide-y -mx-5">
          {order.order_items.map((it) => (
            <li
              key={it.id}
              className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{it.product_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  수량 <span className="font-mono tabular text-foreground">{it.quantity}</span>
                </p>
              </div>
              <span className="font-mono tabular whitespace-nowrap">
                {formatKRW(Number(it.subtotal))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t flex items-baseline justify-between">
          <span className="font-medium">합계</span>
          <span className="font-mono tabular text-xl font-semibold">
            {formatKRW(Number(order.total_amount))}
          </span>
        </div>
      </Panel>

      <TransitionButtons orderId={order.id} status={order.status as OrderStatus} />
    </div>
  );
}

function Panel({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-5 flex items-center gap-2 border-b">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-baseline gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </dt>
      <dd className={mono ? 'font-mono tabular text-sm' : 'text-sm'}>{children}</dd>
    </div>
  );
}
