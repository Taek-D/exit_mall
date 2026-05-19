import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { type ShippingUploadStatus } from '@/lib/types';
import { ShippingUploadStatusBadge } from '@/components/StatusBadge';
import { InvoiceLookupButton } from '@/components/InvoiceLookupButton';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { CancelButton } from '../../exitmall/[id]/CancelButton';
import { TrackingDownloadButton } from '../../exitmall/[id]/TrackingDownloadButton';

export const dynamic = 'force-dynamic';

type Item = {
  no: number;
  recipient: string;
  phone: string;
  address: string;
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

type Upload = {
  id: string;
  original_name: string;
  status: string;
  items: Item[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  admin_storage_path: string | null;
  created_at: string;
};

export default async function PurchasedShippingUploadDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select(
      'id, original_name, status, items, total_quantity, shipping_fee_total, admin_memo, admin_storage_path, created_at',
    )
    .eq('id', params.id)
    .eq('upload_type', 'purchased')
    .single<Upload>();
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/shipping-uploads/purchased"
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
              {data.original_name}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-2">
              <ShippingUploadStatusBadge status={data.status as ShippingUploadStatus} />
              <span>· {new Date(data.created_at).toLocaleString('ko-KR')}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.status === 'pending' && <CancelButton uploadId={data.id} />}
          {data.admin_storage_path && (
            <TrackingDownloadButton
              storagePath={data.admin_storage_path}
              originalName={`tracking-${data.original_name}`}
            />
          )}
        </div>
      </header>

      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-4 h-10">#</th>
              <th className="font-medium px-3">받는 사람</th>
              <th className="font-medium px-3">상품명 / 옵션</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">안내 배송비</th>
              <th className="font-medium px-3">송장 / 조회</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.no} className="border-t">
                <td className="px-4 py-2 font-mono tabular text-xs">{it.no}</td>
                <td className="px-3 py-2">
                  {it.recipient}
                  <p className="text-xs text-muted-foreground">
                    {it.phone} · {it.address}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <span>{it.product_code}</span>
                  {it.product_name && (
                    <span className="text-muted-foreground"> / {it.product_name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.quantity}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(3300)}</td>
                <td className="px-3 py-2 text-xs">
                  {it.tracking_number ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{it.tracking_number}</span>
                      <InvoiceLookupButton tracking={it.tracking_number} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">미등록</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-4 py-3 text-right font-medium">
                {data.items.length}건(수량 {data.total_quantity}개) · 안내 배송비 합계
              </td>
              <td></td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(data.shipping_fee_total))}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>

      {data.status === 'rejected' && data.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {data.admin_memo}
        </div>
      )}
    </div>
  );
}
