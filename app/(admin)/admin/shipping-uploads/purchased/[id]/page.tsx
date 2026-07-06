import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type ShippingUploadStatus } from '@/lib/types';
import { ShippingUploadStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { ReviewActions } from './ReviewActions';
import { DownloadButton } from '../../exitmall/[id]/DownloadButton';
import { AttachTrackingForm } from '../../exitmall/[id]/AttachTrackingForm';
import { CompleteButton } from '../../exitmall/[id]/CompleteButton';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchAdminShippingUploadDetail } from '@/lib/admin/order-details';
import { CustomerSummaryCard } from '@/components/admin/DetailPanels';

export const dynamic = 'force-dynamic';

export default async function AdminPurchasedShippingUploadDetail({
  params,
}: {
  params: { id: string };
}) {
  const upload = await fetchAdminShippingUploadDetail(params.id, 'purchased');
  if (!upload) notFound();

  const balance = Number(upload.profiles?.deposit_balance ?? 0);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/admin/shipping-uploads/purchased"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        업로드 목록
      </Link>

      <header className="pb-4 border-b flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="font-heading font-semibold text-2xl tracking-tight break-all">
              {upload.original_name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-2">
              <ShippingUploadStatusBadge status={upload.status as ShippingUploadStatus} />
              <span>· {formatShortDateTimeKR(upload.created_at)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            storagePath={upload.storage_path}
            originalName={upload.original_name}
            label="고객 업로드 원본"
          />
          {upload.admin_storage_path && (
            <DownloadButton
              storagePath={upload.admin_storage_path}
              originalName={`tracking-${upload.original_name}`}
              label="송장 입력본"
            />
          )}
        </div>
      </header>

      <CustomerSummaryCard
        name={upload.profiles?.name ?? '-'}
        email={upload.profiles?.email ?? '-'}
        phone={upload.profiles?.phone ?? '-'}
        balance={formatKRW(balance)}
        insufficient={false}
      />

      <section className="rounded-md border border-accent/20 bg-accent/5 p-3 text-sm text-muted-foreground">
        배송비는 기존 배송대행 기준으로 안내만 표시합니다. 승인 시 예치금은 차감하지 않습니다.
      </section>

      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-4 h-10">#</th>
              <th className="font-medium px-3">내품코드</th>
              <th className="font-medium px-3">받는 사람</th>
              <th className="font-medium px-3">상품명 / 옵션</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">안내 배송비</th>
              <th className="font-medium px-3">송장번호</th>
            </tr>
          </thead>
          <tbody>
            {upload.items.map((item) => (
              <tr key={item.no} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{item.no}</td>
                <td className="px-3 py-2">{item.internal_code ?? '-'}</td>
                <td className="px-3 py-2">
                  {item.recipient}
                  <p className="text-xs text-muted-foreground">
                    {item.phone} · {item.address}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <span>{item.product_code}</span>
                  {item.product_name && (
                    <span className="text-muted-foreground"> / {item.product_name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{item.quantity}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(3300)}</td>
                <td className="px-3 py-2 font-mono text-xs">{item.tracking_number ?? '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={4} className="px-4 py-3 text-right font-medium">
                {upload.items.length}건 · 안내 배송비 합계
              </td>
              <td></td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(upload.shipping_fee_total))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>

      {upload.status === 'rejected' && upload.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {upload.admin_memo}
        </div>
      )}

      {upload.status === 'pending' && <ReviewActions uploadId={upload.id} />}

      {(upload.status === 'approved' || upload.status === 'shipped') && (
        <AttachTrackingForm uploadId={upload.id} />
      )}
      {upload.status === 'shipped' && <CompleteButton uploadId={upload.id} />}
    </div>
  );
}
