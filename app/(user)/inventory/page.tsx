import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  computeAvailableInventory,
  type InventoryRow,
  type PendingShippingRow,
} from '@/lib/inventory';
import { Boxes, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InvJoin = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};

type ShippingPendingItem = {
  items: Array<{ product_id?: string; product_code?: string; quantity?: number }>;
};

export default async function InventoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;
  }

  const { data: invRaw } = await supabase
    .from('user_inventory')
    .select('product_id, quantity, products(name)')
    .eq('user_id', user.id)
    .gt('quantity', 0);
  const inventory: InventoryRow[] = ((invRaw ?? []) as unknown as InvJoin[]).map((r) => ({
    product_id: r.product_id,
    product_name: r.products?.name ?? '(이름 없음)',
    quantity: Number(r.quantity),
  }));

  const { data: pendingRaw } = await supabase
    .from('order_uploads')
    .select('items')
    .eq('user_id', user.id)
    .eq('status', 'pending');

  // 신규 흐름은 server action 이 INSERT 시점에 product_id 를 캡처하므로
  // 직접 사용. (옛 흐름의 product_code 매칭은 비결정적이라 제거)
  const pendingShipments: PendingShippingRow[] = [];
  for (const u of (pendingRaw ?? []) as unknown as ShippingPendingItem[]) {
    for (const it of u.items ?? []) {
      if (!it.product_id) continue;
      pendingShipments.push({ product_id: it.product_id, quantity: Number(it.quantity ?? 0) });
    }
  }

  const rows = computeAvailableInventory(inventory, pendingShipments);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">보유 재고</h1>
          <p className="text-sm text-muted-foreground mt-1">
            엑시트몰 상품 구매가 승인되면 적립되고, 배송대행 업로드가 승인되면 차감됩니다.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <p className="font-medium">보유한 재고가 없습니다</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/shop" className="underline">
              상품
            </Link>
            을 구매한 뒤 관리자 승인을 받으면 여기에 적립됩니다.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-5 h-10">상품</th>
                <th className="font-medium px-3 text-right">가용</th>
                <th className="font-medium px-3 text-right">검토대기 예약</th>
                <th className="font-medium px-3 text-right">총 보유</th>
                <th className="font-medium px-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id} className="border-t">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {r.product_name}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular">{r.available}</td>
                  <td className="px-3 py-3 text-right font-mono tabular text-amber-600">
                    {r.reserved > 0 ? r.reserved : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular text-muted-foreground">
                    {r.quantity}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/inventory/${r.product_id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      변동 내역
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
