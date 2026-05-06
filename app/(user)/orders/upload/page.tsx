import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { UploadForm } from './UploadForm';
import { formatKRW } from '@/lib/money';
import { OrderUploadStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, Download, FileSpreadsheet, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type UploadRow = {
  id: string;
  original_name: string;
  status: string;
  total_quantity: number;
  total_amount: number;
  admin_memo: string | null;
  created_at: string;
  reviewed_at: string | null;
  order_id: string | null;
};

export default async function OrderUploadPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select(
      'id,original_name,status,total_quantity,total_amount,admin_memo,created_at,reviewed_at,order_id',
    )
    .order('created_at', { ascending: false })
    .limit(20);

  const uploads = (data ?? []) as unknown as UploadRow[];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          주문 내역
        </Link>
      </div>

      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">주문서 업로드</h1>
        <p className="text-sm text-muted-foreground mt-1">
          엑셀 양식을 작성해 업로드하면 관리자가 검토 후 승인합니다. 승인 시점에
          예치금이 차감되고 주문이 정식 접수됩니다.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">엑셀 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            상호명·연락처·배송주소를 작성한 후, 11행 아래에 상품을 입력해주세요.
          </p>
        </div>
        <a
          href="/order-template.xlsx"
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
        {uploads.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">아직 업로드한 주문서가 없습니다</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ul className="divide-y">
              {uploads.map((u) => (
                <li key={u.id} className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium truncate"
                        title={u.original_name}
                      >
                        {u.original_name}
                      </span>
                      <OrderUploadStatusBadge status={u.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(u.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {u.total_quantity.toLocaleString()}개 ·{' '}
                      <span className="font-mono tabular">{formatKRW(Number(u.total_amount))}</span>
                    </p>
                    {u.status === 'rejected' && u.admin_memo && (
                      <p className="text-xs text-destructive mt-1 break-words">
                        반려 사유: {u.admin_memo}
                      </p>
                    )}
                    {u.status === 'approved' && u.order_id && (
                      <p className="text-xs text-success mt-1">
                        주문번호{' '}
                        <span className="font-mono tabular">{u.order_id.slice(0, 8)}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
