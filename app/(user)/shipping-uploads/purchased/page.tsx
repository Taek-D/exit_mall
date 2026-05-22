import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/money';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchRecentShippingUploads } from '@/lib/orders/queries';
import {
  summarizePurchasedInventory,
  type PurchasedInventoryReservation,
  type PurchasedInventorySummaryLot,
} from '@/lib/purchased-shipping';
import { UploadForm } from './UploadForm';
import { Boxes, Download, FileSpreadsheet, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type PurchasedInventorySummaryQueryLot = PurchasedInventorySummaryLot & {
  source_type: 'inbound_request' | 'admin_manual';
  inbound_requests?: { status?: string | null } | Array<{ status?: string | null }> | null;
};

function getInboundRequestStatus(row: PurchasedInventorySummaryQueryLot): string | null {
  const inbound = row.inbound_requests;
  if (Array.isArray(inbound)) return inbound[0]?.status ?? null;
  return inbound?.status ?? null;
}

function isVisiblePurchasedInventoryLot(row: PurchasedInventorySummaryQueryLot): boolean {
  return (
    row.source_type === 'admin_manual' ||
    (row.source_type === 'inbound_request' && getInboundRequestStatus(row) === 'completed')
  );
}

async function fetchPurchasedInventoryRows(userId: string) {
  const supabase = createClient();
  const { data: lotsData } = await (supabase.from as any)('purchased_inventory_lots')
    .select(
      'id, product_name, option_name, initial_quantity, remaining_quantity, source_type, created_at, inbound_requests(status)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const { data: pendingUploads } = await supabase
    .from('order_uploads')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('upload_type', 'purchased');

  const pendingIds = ((pendingUploads ?? []) as Array<{ id: string }>).map((row) => row.id);
  let reservations: PurchasedInventoryReservation[] = [];
  if (pendingIds.length > 0) {
    const { data: reservationData } = await (supabase.from as any)('purchased_shipping_allocations')
      .select('lot_id, quantity')
      .eq('user_id', userId)
      .in('upload_id', pendingIds);
    reservations = (reservationData ?? []) as PurchasedInventoryReservation[];
  }

  const visibleLots = ((lotsData ?? []) as PurchasedInventorySummaryQueryLot[])
    .filter(isVisiblePurchasedInventoryLot)
    .map<PurchasedInventorySummaryLot>((row) => ({
      id: row.id,
      product_name: row.product_name,
      option_name: row.option_name,
      initial_quantity: Number(row.initial_quantity),
      remaining_quantity: Number(row.remaining_quantity),
      created_at: row.created_at,
    }));

  return summarizePurchasedInventory(visibleLots, reservations);
}

export default async function PurchasedShippingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [rows, uploads] = user
    ? await Promise.all([
        fetchPurchasedInventoryRows(user.id),
        fetchRecentShippingUploads(30, 'purchased'),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">사입재고 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          입고리스트에서 입고완료된 재고를 선택해 기존 배송대행 양식으로 발송 요청합니다.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">배송대행 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            엑시트몰 배송대행과 같은 양식입니다. 품목명과 내품명은 아래 재고 목록과 맞춰주세요.
          </p>
        </div>
        <a
          href="/shipping-template.xlsx"
          download
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          양식 받기
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">입고완료 재고</h2>
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 flex flex-col items-center gap-3 text-center">
            <Boxes className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">배송 가능한 사입재고가 없습니다.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10">상품명</th>
                  <th className="font-medium px-3">옵션</th>
                  <th className="font-medium px-3 text-right">가능</th>
                  <th className="font-medium px-3 text-right">검토대기 예약</th>
                  <th className="font-medium px-3 text-right">총 입고</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.product_name}:${row.option_name}`} className="border-t">
                    <td className="px-4 py-2 font-medium">{row.product_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.option_name || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular">
                      {row.available_quantity}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular text-amber-600">
                      {row.reserved_quantity > 0 ? row.reserved_quantity : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular text-muted-foreground">
                      {row.total_quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UploadForm />

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">최근 업로드</h2>
        {uploads.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">업로드 내역이 없습니다</p>
          </div>
        ) : (
          <ul className="rounded-lg border bg-card divide-y">
            {uploads.map((u) => (
              <li key={u.id} className="p-4 flex items-center gap-3">
                <FileSpreadsheet
                  className="h-4 w-4 text-muted-foreground shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/shipping-uploads/purchased/${u.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {u.original_name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatShortDateTimeKR(u.created_at)}
                    {' · '}
                    <span className="font-medium">
                      {SHIPPING_UPLOAD_STATUS_LABEL[u.status as ShippingUploadStatus] ?? u.status}
                    </span>
                    {' · '}
                    {u.total_quantity}개 / 안내 배송비 {formatKRW(Number(u.shipping_fee_total))}
                  </p>
                  {u.status === 'rejected' && u.admin_memo && (
                    <p className="text-xs text-destructive mt-1">반려 사유: {u.admin_memo}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
