import Link from 'next/link';
import { LifeBuoy, PlusCircle } from 'lucide-react';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchMySupportRequests } from '@/lib/support/queries';

export const dynamic = 'force-dynamic';

export default async function SupportRequestsPage() {
  const rows = await fetchMySupportRequests(50);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          교환/반품 및 CS 문의
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          교환, 반품, 기타 문의를 비공개로 남기고 답변을 확인하세요.
        </p>
      </header>

      <div className="flex justify-between items-center">
        <h2 className="font-heading font-semibold text-lg">내 문의</h2>
        <Link
          href="/support-requests/new"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden />
          문의 등록
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <LifeBuoy className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium">등록된 문의가 없습니다</p>
            <Link href="/support-requests/new" className="text-sm text-primary hover:underline">
              새 문의 등록하기
            </Link>
          </div>
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {rows.map((row) => {
            const unread =
              row.last_comment_at &&
              row.last_comment_by_role === 'admin' &&
              (!row.user_last_read_at || row.last_comment_at > row.user_last_read_at);

            return (
              <li key={row.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SupportCategoryBadge category={row.category} />
                    <SupportStatusBadge status={row.status} />
                    {unread && (
                      <span className="text-[11px] text-destructive font-medium">새 답변</span>
                    )}
                  </div>
                  <Link
                    href={`/support-requests/${row.id}`}
                    className="mt-2 block text-sm font-medium hover:underline truncate"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatShortDateTimeKR(row.created_at)}
                    {row.last_comment_at && (
                      <>
                        {' · '}최근 답변 {formatShortDateTimeKR(row.last_comment_at)}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
