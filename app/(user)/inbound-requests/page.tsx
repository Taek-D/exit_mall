import Link from 'next/link';
import { Download, FileSpreadsheet, Inbox, PlusCircle } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchMyInboundRequests } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InboundRequestsPage() {
  const rows = await fetchMyInboundRequests(50);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">입고리스트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          입고 요청을 비공개로 등록하고, 진행상황을 관리자와 댓글로 주고받으세요.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">엑셀 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            입고리스트 양식에 품목·수량을 채워 업로드해주세요.
          </p>
        </div>
        <a
          href="/inbound-template.xlsx"
          download
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          양식 받기
        </a>
      </section>

      <div className="flex justify-between items-center">
        <h2 className="font-heading font-semibold text-lg">내 입고요청</h2>
        <Link
          href="/inbound-requests/new"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden />
          새 입고요청
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">등록된 입고요청이 없습니다</p>
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {rows.map((r) => {
            const unread =
              r.last_comment_at &&
              r.last_comment_by_role === 'admin' &&
              (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at);
            return (
              <li key={r.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/inbound-requests/${r.id}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {r.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.tracking_numbers.length > 0 && (
                      <>
                        <span className="font-mono tabular">{r.tracking_numbers[0]}</span>
                        {r.tracking_numbers.length > 1 && ` 외 ${r.tracking_numbers.length - 1}`}
                        {' · '}
                      </>
                    )}
                    {formatShortDateTimeKR(r.created_at)}
                    {r.last_comment_at && (
                      <>
                        {' · '}최근 댓글 {formatShortDateTimeKR(r.last_comment_at)}
                      </>
                    )}
                  </p>
                </div>
                {unread && (
                  <span className="text-[11px] text-destructive font-medium">새 답변</span>
                )}
                <InboundStatusBadge status={r.status as InboundStatus} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
