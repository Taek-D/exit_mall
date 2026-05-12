import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { fetchAllInboundRequests } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import type { InboundStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS: { value: InboundStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

export default async function AdminInboundRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const raw = searchParams.status;
  const status: InboundStatus | 'all' =
    raw && TABS.some((t) => t.value === raw) ? (raw as InboundStatus | 'all') : 'all';
  const rows = await fetchAllInboundRequests(status, 200);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">입고리스트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          고객이 등록한 입고요청을 비공개로 검토하고 댓글로 회신합니다.
        </p>
      </header>

      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={
              t.value === 'all'
                ? '/admin/inbound-requests'
                : `/admin/inbound-requests?status=${t.value}`
            }
            className={cn(
              'px-3 h-9 inline-flex items-center text-sm border-b-2 transition-colors',
              status === t.value
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">입고요청이 없습니다</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 h-10 font-medium">상태</th>
                <th className="text-left px-3 h-10 font-medium">제목</th>
                <th className="text-left px-3 h-10 font-medium">작성자</th>
                <th className="text-left px-3 h-10 font-medium">최근 활동</th>
                <th className="text-left px-3 h-10 font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const unread =
                  r.last_comment_at &&
                  r.last_comment_by_role === 'user' &&
                  (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at);
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <InboundStatusBadge status={r.status as InboundStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/inbound-requests/${r.id}`}
                        className="hover:underline"
                      >
                        {r.title}
                      </Link>
                      {unread && (
                        <span className="ml-2 text-[11px] text-destructive font-medium">
                          새 답변
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.profile?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.last_comment_at ? formatShortDateTimeKR(r.last_comment_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatShortDateTimeKR(r.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
