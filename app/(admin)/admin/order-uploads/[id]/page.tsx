import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { OrderUploadStatusBadge } from '@/components/StatusBadge';
import { ArrowLeft, User, MapPin, Package, FileSpreadsheet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReviewActions } from './ReviewActions';
import { DownloadButton } from './DownloadButton';

export const dynamic = 'force-dynamic';

type ParsedItem = {
  no?: number;
  brand?: string | null;
  code?: string | null;
  name?: string;
  option?: string | null;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  memo?: string | null;
  shipping_request?: string | null;
};

type Upload = {
  id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  order_date: string | null;
  buyer_order_number: string | null;
  company_name: string | null;
  contact_person: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  shipping_address: string | null;
  request_memo: string | null;
  items: ParsedItem[];
  total_quantity: number;
  total_amount: number;
  status: string;
  admin_memo: string | null;
  parse_error: string | null;
  reviewed_at: string | null;
  order_id: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export default async function AdminOrderUploadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: upload } = await supabase
    .from('order_uploads')
    .select(
      '*,profiles!order_uploads_user_id_fkey(name,email,phone,deposit_balance)',
    )
    .eq('id', params.id)
    .single<Upload>();
  if (!upload) notFound();

  const items = (upload.items ?? []) as ParsedItem[];

  const balance = Number(upload.profiles?.deposit_balance ?? 0);
  const insufficient = upload.status === 'pending' && balance < Number(upload.total_amount);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/admin/order-uploads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        주문서 목록
      </Link>

      <header className="pb-4 border-b flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
            <h1 className="font-heading font-semibold text-2xl tracking-tight break-all">
              {upload.original_name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular">{upload.id.slice(0, 8)}</span> ·{' '}
            {new Date(upload.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OrderUploadStatusBadge status={upload.status} />
          <DownloadButton storagePath={upload.storage_path} />
        </div>
      </header>

      {upload.parse_error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          파싱 오류: {upload.parse_error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="고객" Icon={User}>
          <dl className="space-y-2 text-sm">
            <Row label="이름">{upload.profiles?.name ?? '—'}</Row>
            <Row label="이메일" mono>
              {upload.profiles?.email ?? '—'}
            </Row>
            <Row label="연락처" mono>
              {upload.profiles?.phone ?? '—'}
            </Row>
            <Row label="예치금" mono>
              <span className={insufficient ? 'text-destructive font-medium' : ''}>
                {formatKRW(balance)}
              </span>
            </Row>
          </dl>
        </Panel>

        <Panel title="주문서 정보" Icon={FileSpreadsheet}>
          <dl className="space-y-2 text-sm">
            <Row label="주문일자">{upload.order_date ?? '—'}</Row>
            <Row label="고객주문#" mono>
              {upload.buyer_order_number ?? '—'}
            </Row>
            <Row label="상호명">{upload.company_name ?? '—'}</Row>
            <Row label="담당자">{upload.contact_person ?? '—'}</Row>
            <Row label="이메일" mono>
              {upload.buyer_email ?? '—'}
            </Row>
          </dl>
        </Panel>

        <Panel title="배송 정보" Icon={MapPin}>
          <dl className="space-y-2 text-sm">
            <Row label="연락처" mono>
              {upload.buyer_phone ?? '—'}
            </Row>
            <Row label="주소">{upload.shipping_address ?? '—'}</Row>
            {upload.request_memo && <Row label="요청사항">{upload.request_memo}</Row>}
          </dl>
        </Panel>
      </div>

      <Panel title={`주문 항목 (${items.length}건)`} Icon={Package}>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-5 h-10 w-10">#</th>
                <th className="font-medium px-3">브랜드</th>
                <th className="font-medium px-3">관리코드</th>
                <th className="font-medium px-3">상품명 / 옵션</th>
                <th className="font-medium px-3 text-right">수량</th>
                <th className="font-medium px-3 text-right">단가</th>
                <th className="font-medium px-3 text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const qty = Number(it.quantity ?? 0);
                const price = Number(it.unit_price ?? 0);
                const sub = qty * price;
                return (
                  <tr key={i} className="border-t">
                    <td className="px-5 text-muted-foreground font-mono tabular text-xs">
                      {it.no ?? i + 1}
                    </td>
                    <td className="px-3 text-muted-foreground">{it.brand ?? '—'}</td>
                    <td className="px-3 font-mono text-xs">{it.code ?? '—'}</td>
                    <td className="px-3">
                      <p className="font-medium">{it.name ?? '—'}</p>
                      {it.option && (
                        <p className="text-xs text-muted-foreground mt-0.5">{it.option}</p>
                      )}
                      {it.memo && (
                        <p className="text-xs text-muted-foreground mt-0.5">메모: {it.memo}</p>
                      )}
                    </td>
                    <td className="px-3 text-right font-mono tabular">{qty.toLocaleString()}</td>
                    <td className="px-3 text-right font-mono tabular">{formatKRW(price)}</td>
                    <td className="px-3 text-right font-mono tabular">{formatKRW(sub)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-surface-muted/40">
                <td colSpan={4} className="px-5 py-3 font-medium">
                  합계
                </td>
                <td className="px-3 py-3 text-right font-mono tabular">
                  {Number(upload.total_quantity).toLocaleString()}
                </td>
                <td></td>
                <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                  {formatKRW(Number(upload.total_amount))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {upload.status === 'rejected' && upload.admin_memo && (
        <Panel title="반려 사유">
          <p className="text-sm text-destructive whitespace-pre-wrap">{upload.admin_memo}</p>
        </Panel>
      )}

      {upload.status === 'approved' && upload.order_id && (
        <Panel title="생성된 주문">
          <Link
            href={`/admin/orders/${upload.order_id}`}
            className="text-sm text-accent hover:underline font-mono tabular"
          >
            {upload.order_id}
          </Link>
        </Panel>
      )}

      {upload.status === 'pending' && (
        <div className="space-y-2">
          {insufficient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              고객의 예치금이 부족합니다. 승인 시 차감 단계에서 실패합니다.
            </div>
          )}
          <ReviewActions uploadId={upload.id} />
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-5 flex items-center gap-2 border-b">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
        <h2 className="font-heading font-semibold text-sm">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-baseline gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </dt>
      <dd className={mono ? 'font-mono tabular text-sm break-all' : 'text-sm break-words'}>
        {children}
      </dd>
    </div>
  );
}
