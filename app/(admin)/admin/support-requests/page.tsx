import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchAllSupportRequests } from '@/lib/support/queries';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TABS: { value: SupportStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  ...Object.entries(SUPPORT_STATUS_LABEL).map(([value, label]) => ({
    value: value as SupportStatus,
    label,
  })),
];

const CATEGORY_OPTIONS: { value: SupportCategory | 'all'; label: string }[] = [
  { value: 'all', label: '전체 유형' },
  ...Object.entries(SUPPORT_CATEGORY_LABEL).map(([value, label]) => ({
    value: value as SupportCategory,
    label,
  })),
];

function isStatus(value: string | undefined): value is SupportStatus | 'all' {
  return value === 'all' || Object.keys(SUPPORT_STATUS_LABEL).includes(value ?? '');
}

function isCategory(value: string | undefined): value is SupportCategory | 'all' {
  return value === 'all' || Object.keys(SUPPORT_CATEGORY_LABEL).includes(value ?? '');
}

export default async function AdminSupportRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; category?: string; q?: string };
}) {
  const status = isStatus(searchParams.status) ? searchParams.status : 'all';
  const category = isCategory(searchParams.category) ? searchParams.category : 'all';
  const q = searchParams.q?.trim() ?? '';
  const rows = await fetchAllSupportRequests({
    status,
    category,
    search: q || undefined,
  });

  function tabHref(value: SupportStatus | 'all') {
    const params = new URLSearchParams();
    if (value !== 'all') params.set('status', value);
    if (category !== 'all') params.set('category', category);
    if (q) params.set('q', q);
    const query = params.toString();
    return query ? `/admin/support-requests?${query}` : '/admin/support-requests';
  }

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          교환/반품 및 CS 문의
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          고객이 등록한 교환, 반품, CS 문의를 확인하고 처리합니다.
        </p>
      </header>

      <form method="GET" className="flex max-w-2xl flex-wrap gap-2">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="문의 유형 필터"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="제목, 작성자, 이메일로 검색"
          className="h-9 min-w-64 flex-1 rounded-md border bg-background px-3 text-sm"
          aria-label="문의 검색"
        />
        <button
          type="submit"
          className="h-9 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-muted"
        >
          검색
        </button>
      </form>

      <nav className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={cn(
              'inline-flex h-9 items-center border-b-2 px-3 text-sm transition-colors',
              status === tab.value
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <LifeBuoy className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">등록된 문의가 없습니다</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-left font-medium">상태</th>
                <th className="h-10 px-3 text-left font-medium">유형</th>
                <th className="h-10 px-3 text-left font-medium">제목</th>
                <th className="h-10 px-3 text-left font-medium">작성자</th>
                <th className="h-10 px-3 text-left font-medium">최근 활동</th>
                <th className="h-10 px-3 text-left font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const unread =
                  row.last_comment_at &&
                  row.last_comment_by_role === 'user' &&
                  (!row.admin_last_read_at || row.last_comment_at > row.admin_last_read_at);

                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <SupportStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2">
                      <SupportCategoryBadge category={row.category} />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/support-requests/${row.id}`} className="hover:underline">
                        {row.title}
                      </Link>
                      {unread && (
                        <span className="ml-2 text-[11px] font-medium text-destructive">
                          새 댓글
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.profile?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.last_comment_at ? formatShortDateTimeKR(row.last_comment_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatShortDateTimeKR(row.created_at)}
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
