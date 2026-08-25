import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  computeAvailableInventory,
  type InventoryRow,
  type PendingShippingRow,
  type InventoryKey,
} from '@/lib/inventory';
import { Boxes, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InvJoin = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};

type CustomInvRow = {
  id: string;
  name: string;
  quantity: number;
};

type ShippingPendingItem = {
  items: Array<{
    product_id?: string;
    custom_inventory_id?: string;
    quantity?: number;
  }>;
};

function keyHref(k: InventoryKey): string {
  return k.kind === 'product'
    ? `/inventory/product/${k.product_id}`
    : `/inventory/custom/${k.custom_inventory_id}`;
}

function keyToReactKey(k: InventoryKey): string {
  return k.kind === 'product' ? `p:${k.product_id}` : `c:${k.custom_inventory_id}`;
}

export default async function InventoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;
  }

  const [{ data: invRaw }, { data: customInvRaw }, { data: pendingRaw }] = await Promise.all([
    supabase
      .from('user_inventory')
      .select('product_id, quantity, products(name)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    supabase
      .from('user_custom_inventory')
      .select('id, name, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    supabase
      .from('order_uploads')
      .select('items')
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ]);

  const inventory: InventoryRow[] = [
    ...((invRaw ?? []) as unknown as InvJoin[]).map((r) => ({
      key: { kind: 'product' as const, product_id: r.product_id },
      product_name: r.products?.name ?? '(이름 없음)',
      quantity: Number(r.quantity),
    })),
    ...((customInvRaw ?? []) as unknown as CustomInvRow[]).map((r) => ({
      key: { kind: 'custom' as const, custom_inventory_id: r.id },
      product_name: r.name,
      quantity: Number(r.quantity),
    })),
  ];

  const pendingShipments: PendingShippingRow[] = [];
  for (const u of (pendingRaw ?? []) as unknown as ShippingPendingItem[]) {
    for (const it of u.items ?? []) {
      const qty = Number(it.quantity ?? 0);
      if (it.product_id) {
        pendingShipments.push({
          key: { kind: 'product', product_id: it.product_id },
          quantity: qty,
        });
      } else if (it.custom_inventory_id) {
        pendingShipments.push({
          key: { kind: 'custom', custom_inventory_id: it.custom_inventory_id },
          quantity: qty,
        });
      }
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
        <div className="rounded-lg border bg-card overflow-x-auto">
          {/* 표를 줄이지 말고 가로로 스크롤시킨다(docs/standards.md).
              상품명만 줄바꿈을 허용하고 수량 열은 한 줄로 고정한다. */}
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-5 h-10 w-full">상품</th>
                <th className="font-medium px-3 text-right">가용</th>
                <th className="font-medium px-3 text-right">검토대기 예약</th>
                <th className="font-medium px-3 text-right">총 보유</th>
                <th className="font-medium px-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={keyToReactKey(r.key)} className="border-t">
                  <td className="px-5 py-3 whitespace-normal">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span>{r.product_name}</span>
                      {r.key.kind === 'custom' && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          수기
                        </span>
                      )}
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
                    <Link href={keyHref(r.key)} className="text-xs text-accent hover:underline">
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
