import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import { UserStatusBadge, StatusPill } from '@/components/StatusBadge';
import type { UserStatus } from '@/lib/types';
import { USER_GROUP_SHORT_LABEL, isUserGroup } from '@/lib/auth/user-groups';
import { Users, ChevronRight } from 'lucide-react';
import { AdminUserSearchInput } from '@/components/admin/AdminUserSearchInput';
import { matchesAdminUserNameQuery } from '@/lib/admin/user-search';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  email: string;
  deposit_balance: number;
  low_balance_threshold: number;
  status: string;
  role: string;
  user_group: string | null;
};

const TABS = [
  { key: undefined, label: '전체' },
  { key: 'low', label: '잔액 낮음' },
  { key: 'pending', label: '승인 대기' },
  { key: 'rejected', label: '반려' },
] as const;

const koreanNameCollator = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
});

function getFirstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { filter?: string | string[]; q?: string | string[] };
}) {
  const supabase = createClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  const list = (users ?? []) as unknown as UserRow[];
  const filter = getFirstSearchParam(searchParams.filter);
  const q = getFirstSearchParam(searchParams.q)?.trim() ?? '';

  const filtered = list
    .filter((u) => {
      if (filter === 'low') return Number(u.deposit_balance) <= Number(u.low_balance_threshold);
      if (filter === 'pending') return u.status === 'pending';
      if (filter === 'rejected') return u.status === 'rejected';
      return true;
    })
    .filter((u) => matchesAdminUserNameQuery(u.name || '', q))
    .sort((a, b) => koreanNameCollator.compare(a.name || '', b.name || ''));

  const counts = {
    all: list.length,
    low: list.filter((u) => Number(u.deposit_balance) <= Number(u.low_balance_threshold)).length,
    pending: list.filter((u) => u.status === 'pending').length,
    rejected: list.filter((u) => u.status === 'rejected').length,
  };

  return (
    <div className="space-y-5">
      <header className="pb-4 border-b">
        <p className="text-sm text-muted-foreground">
          전체 <span className="font-mono tabular font-medium text-foreground">{counts.all}</span>명
          의 사용자
        </p>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const active = filter === t.key;
              const params = new URLSearchParams();
              if (t.key) params.set('filter', t.key);
              if (q) params.set('q', q);
              const query = params.toString();
              const href = query ? `/admin/users?${query}` : '/admin/users';
              const count =
                t.key === 'low'
                  ? counts.low
                  : t.key === 'pending'
                    ? counts.pending
                    : t.key === 'rejected'
                      ? counts.rejected
                      : counts.all;
              return (
                <Link
                  key={t.label}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-4 h-11 text-sm border-b-2 transition-colors whitespace-nowrap',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-mono tabular',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-b px-4 py-3">
          <AdminUserSearchInput initialQuery={q} />
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">
              {q ? '검색 결과가 없습니다.' : '해당 사용자가 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10 whitespace-nowrap">이름</th>
                  <th className="font-medium px-3 w-full">이메일</th>
                  <th className="font-medium px-3 text-right whitespace-nowrap">잔액</th>
                  <th className="font-medium px-3 text-right whitespace-nowrap">임계치</th>
                  <th className="font-medium px-3 whitespace-nowrap">상태</th>
                  <th className="font-medium px-3 whitespace-nowrap">그룹</th>
                  <th className="font-medium px-3 whitespace-nowrap">역할</th>
                  <th className="font-medium px-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const low =
                    Number(u.deposit_balance) <= Number(u.low_balance_threshold) && u.role === 'user';
                  return (
                    <tr
                      key={u.id}
                      className="border-t h-11 hover:bg-surface-muted/50 transition-colors"
                    >
                      <td className="px-4 whitespace-nowrap">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="font-medium hover:underline"
                        >
                          {u.name}
                        </Link>
                      </td>
                      <td className="px-3 text-muted-foreground truncate max-w-[220px]">{u.email}</td>
                      <td
                        className={cn(
                          'px-3 text-right font-mono tabular whitespace-nowrap',
                          low && 'text-destructive font-medium',
                        )}
                      >
                        {formatKRW(Number(u.deposit_balance))}
                      </td>
                      <td className="px-3 text-right font-mono tabular text-muted-foreground whitespace-nowrap">
                        {formatKRW(Number(u.low_balance_threshold))}
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        <UserStatusBadge status={u.status as UserStatus} />
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        {u.role === 'admin' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : isUserGroup(u.user_group) ? (
                          <StatusPill tone={u.user_group === 'group2' ? 'warning' : 'neutral'}>
                            {USER_GROUP_SHORT_LABEL[u.user_group]}
                          </StatusPill>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        {u.role === 'admin' ? (
                          <StatusPill tone="info">관리자</StatusPill>
                        ) : (
                          <span className="text-xs text-muted-foreground">사용자</span>
                        )}
                      </td>
                      <td className="px-3 text-right">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          aria-label="상세"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
