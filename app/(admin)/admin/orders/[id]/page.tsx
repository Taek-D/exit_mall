import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type StockOrderStatus } from '@/lib/types';
import { StockOrderStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, User, Package } from 'lucide-react';
import { ReviewActions } from './ReviewActions';

export const dynamic = 'force-dynamic';

type Item = {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
};

type StockOrder = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: Item[];
  admin_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export default async function AdminStockOrderDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await (supabase.from('stock_orders' as any) as any)
    .select('*,profiles!stock_orders_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', params.id)
    .single();
  const order = data as StockOrder | null;
  if (!order) notFound();

  const balance = Number(order.profiles?.deposit_balance ?? 0);
  const insufficient = order.status === 'pending' && balance < Number(order.total_amount);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        주문관리 목록
      </Link>

      <header className="pb-4 border-b flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">
            주문 상세 (재고 적립)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular">{order.id.slice(0, 8)}</span> ·{' '}
            {new Date(order.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <StockOrderStatusBadge status={order.status as StockOrderStatus} />
      </header>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">고객</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">이름</dt>
            <dd>{order.profiles?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">이메일</dt>
            <dd className="font-mono">{order.profiles?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">연락처</dt>
            <dd className="font-mono">{order.profiles?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">예치금</dt>
            <dd className={`font-mono ${insufficient ? 'text-destructive font-medium' : ''}`}>
              {formatKRW(balance)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border bg-card">
        <header className="h-11 px-5 flex items-center gap-2 border-b">
          <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">주문 항목</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-5 h-10">상품</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">단가</th>
              <th className="font-medium px-3 text-right">소계</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-5 py-2">{it.product_name}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.qty}</td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  {formatKRW(it.unit_price)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-5 py-3 font-medium text-right">
                합계
              </td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(order.total_amount))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.status === 'rejected' && order.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {order.admin_memo}
        </div>
      )}

      {order.status === 'pending' && (
        <>
          {insufficient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              고객의 가용 예치금이 부족합니다. 승인 시 차감 단계에서 실패할 수 있습니다.
            </div>
          )}
          <ReviewActions orderId={order.id} />
        </>
      )}
    </div>
  );
}
