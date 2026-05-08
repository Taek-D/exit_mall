import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { ShippingUploadStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, FileSpreadsheet, User } from 'lucide-react';
import { ReviewActions } from './ReviewActions';
import { DownloadButton } from './DownloadButton';
import { AttachTrackingForm } from './AttachTrackingForm';
import { CompleteButton } from './CompleteButton';

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
  user_id: string;
  storage_path: string;
  original_name: string;
  status: string;
  items: Item[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  admin_storage_path: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export default async function AdminShippingUploadDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select('*, profiles!order_uploads_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', params.id)
    .single<Upload>();
  if (!data) notFound();

  const balance = Number(data.profiles?.deposit_balance ?? 0);
  const insufficient =
    data.status === 'pending' && balance < Number(data.shipping_fee_total);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/admin/shipping-uploads"
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
            <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-2">
              <ShippingUploadStatusBadge status={data.status as ShippingUploadStatus} />
              <span>· {new Date(data.created_at).toLocaleString('ko-KR')}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            storagePath={data.storage_path}
            originalName={data.original_name}
          />
          {data.admin_storage_path && (
            <DownloadButton
              storagePath={data.admin_storage_path}
              originalName={`tracking-${data.original_name}`}
            />
          )}
        </div>
      </header>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">고객</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">이름</dt>
            <dd>{data.profiles?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">이메일</dt>
            <dd className="font-mono">{data.profiles?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">연락처</dt>
            <dd className="font-mono">{data.profiles?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">예치금</dt>
            <dd className={`font-mono ${insufficient ? 'text-destructive font-medium' : ''}`}>
              {formatKRW(balance)}
            </dd>
          </div>
        </dl>
      </div>

      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-4 h-10">#</th>
              <th className="font-medium px-3">받는사람</th>
              <th className="font-medium px-3">상품 (코드 / 옵션)</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">배송비</th>
              <th className="font-medium px-3">송장번호</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.no} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{it.no}</td>
                <td className="px-3 py-2">
                  {it.recipient}
                  <p className="text-xs text-muted-foreground">
                    {it.phone} · {it.address}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{it.product_code}</span>
                  {it.product_name && (
                    <span className="text-muted-foreground"> / {it.product_name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.quantity}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(3300)}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.tracking_number ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-4 py-3 text-right font-medium">
                {data.items.length}건 · 배송비 합계
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

      {data.status === 'pending' && (
        <>
          {insufficient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              가용 예치금이 배송비보다 부족합니다. 승인 시 차감 단계에서 실패할 수 있습니다.
            </div>
          )}
          <ReviewActions uploadId={data.id} />
        </>
      )}

      {(data.status === 'approved' || data.status === 'shipped') && (
        <AttachTrackingForm uploadId={data.id} />
      )}
      {data.status === 'shipped' && <CompleteButton uploadId={data.id} />}
    </div>
  );
}
