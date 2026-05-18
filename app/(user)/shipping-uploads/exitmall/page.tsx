import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { UploadForm } from './UploadForm';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { Download, FileSpreadsheet, Inbox } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchRecentShippingUploads } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

export default async function ShippingUploadsPage() {
  const rows = await fetchRecentShippingUploads(30);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">엑시트몰 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          CJ 양식 엑셀로 받는사람 명단을 업로드하면, 보유 재고에서 차감되어 발송됩니다. 행 1건당 ₩3,300 배송비가 부과됩니다.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">엑셀 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            &quot;고객주문번호(쿠팡,스스) / 받는 분 성명 / 받는 분 전화번호 / 주소 / 품목명 / 내품명(=옵션) / 수량&quot; 을 행마다 입력해주세요.
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

      <UploadForm />

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">최근 업로드</h2>
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">업로드 내역이 없습니다</p>
          </div>
        ) : (
          <ul className="rounded-lg border bg-card divide-y">
            {rows.map((u) => (
              <li key={u.id} className="p-4 flex items-center gap-3">
                <FileSpreadsheet
                  className="h-4 w-4 text-muted-foreground shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/shipping-uploads/exitmall/${u.id}`}
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
                    {u.total_quantity}개 / 배송비 {formatKRW(Number(u.shipping_fee_total))}
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
