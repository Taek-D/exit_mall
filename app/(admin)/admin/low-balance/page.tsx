import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/money';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AlertTriangle, Phone, Mail, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  deposit_balance: number;
  low_balance_threshold: number;
};

export default async function LowBalancePage() {
  const supabase = createClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id,name,email,phone,deposit_balance,low_balance_threshold')
    .eq('role', 'user')
    .eq('status', 'active');

  const list = (users ?? []) as unknown as UserRow[];
  const low = list
    .filter((u) => Number(u.deposit_balance) <= Number(u.low_balance_threshold))
    .sort((a, b) => Number(a.deposit_balance) - Number(b.deposit_balance));

  return (
    <div className="space-y-5">
      <header className="pb-4 border-b">
        <p className="text-sm text-muted-foreground">
          잔액이 임계치 이하인 활성 고객{' '}
          <span className="font-mono tabular font-medium text-foreground">{low.length}</span>명.
          전화·메시지로 개별 안내해주세요.
        </p>
      </header>

      {low.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-success/10 text-success grid place-items-center">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            잔액 부족 고객이 없습니다. 모든 활성 고객이 임계치 이상 보유 중입니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {low.map((u) => {
            const ratio =
              Number(u.low_balance_threshold) > 0
                ? Math.min(
                    100,
                    Math.round(
                      (Number(u.deposit_balance) / Number(u.low_balance_threshold)) * 100,
                    ),
                  )
                : 0;
            return (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="group rounded-lg border bg-card p-4 transition-colors duration-150 hover:border-foreground/30 relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>

                <dl className="mt-4 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                      현재 잔액
                    </dt>
                    <dd className="font-mono tabular text-lg font-semibold text-destructive">
                      {formatKRW(Number(u.deposit_balance))}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-[11px] text-muted-foreground">임계치</dt>
                    <dd className="font-mono tabular text-sm text-muted-foreground">
                      {formatKRW(Number(u.low_balance_threshold))}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', ratio < 50 ? 'bg-destructive' : 'bg-warning')}
                    style={{ width: `${ratio}%` }}
                    aria-hidden
                  />
                </div>

                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" aria-hidden />
                    <span className="font-mono tabular">{u.phone}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{u.email}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
