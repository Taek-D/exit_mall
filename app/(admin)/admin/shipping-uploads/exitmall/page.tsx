import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { StatusTabs, type StatusTab } from '@/components/StatusTabs';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { OrdersRealtime } from '@/components/OrdersRealtime';
import { ShippingUploadStatusBadge } from '@/components/StatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchAdminShippingUploads } from '@/lib/orders/queries';
import { ChevronRight, Inbox, FileSpreadsheet } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: StatusTab<ShippingUploadStatus | 'all'>[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토대기' },
  { key: 'approved', label: '승인' },
  { key: 'shipped', label: '발송중' },
  { key: 'completed', label: '완료' },
  { key: 'rejected', label: '반려' },
  { key: 'cancelled', label: '취소' },
];

export default async function AdminShippingUploadsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = (searchParams.status ?? 'all') as ShippingUploadStatus | 'all';
  const { rows, counts: c } = await fetchAdminShippingUploads(status);

  return (
    <div className="space-y-5">
      <OrdersRealtime />

      <header>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">엑시트몰 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          전체 {c.all ?? 0}건 · 검토대기 {c.pending ?? 0}건
        </p>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <StatusTabs
          tabs={TABS}
          active={status}
          counts={c}
          hrefFor={(key) =>
            `/admin/shipping-uploads/exitmall${key === 'all' ? '' : `?status=${key}`}`
          }
        />

        {rows.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm">업로드가 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10">파일</th>
                  <th className="font-medium px-3">고객</th>
                  <th className="font-medium px-3 text-right">수량</th>
                  <th className="font-medium px-3 text-right">배송비</th>
                  <th className="font-medium px-3">상태</th>
                  <th className="font-medium px-3">업로드</th>
                  <th className="px-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t h-11 hover:bg-surface-muted/60">
                    <td className="px-4">
                      <Link
                        href={`/admin/shipping-uploads/exitmall/${u.id}`}
                        className="inline-flex items-center gap-1.5 text-accent hover:underline"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                        <span className="truncate max-w-[200px]">{u.original_name}</span>
                      </Link>
                    </td>
                    <td className="px-3">{u.profiles?.name ?? '—'}</td>
                    <td className="px-3 text-right font-mono tabular">{u.total_quantity}</td>
                    <td className="px-3 text-right font-mono tabular">
                      {formatKRW(Number(u.shipping_fee_total))}
                    </td>
                    <td className="px-3">
                      <ShippingUploadStatusBadge status={u.status as ShippingUploadStatus} />
                    </td>
                    <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatShortDateTimeKR(u.created_at)}
                    </td>
                    <td className="px-3 text-right">
                      <Link href={`/admin/shipping-uploads/exitmall/${u.id}`} aria-label="상세">
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
