import { createClient } from '@/lib/supabase/server';
import { DepositRow } from './DepositRow';
import { Wallet } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  amount: number;
  depositor_name: string;
  created_at: string;
  user_id: string;
  profiles: { name: string; email: string; phone: string } | null;
};

export default async function AdminDepositsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('deposit_requests')
    .select(
      'id,amount,depositor_name,created_at,user_id,profiles:profiles!deposit_requests_user_id_fkey(name,email,phone)',
    )
    .eq('status', 'pending')
    .order('created_at');

  const rows = (data ?? []) as unknown as Row[];
  const sum = rows.reduce((acc, r) => acc + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular font-medium text-foreground">{rows.length}</span>건의
          이체 요청 대기
          {rows.length > 0 && (
            <>
              {' · '}
              <span className="font-mono tabular font-medium text-foreground">₩{sum.toLocaleString('ko-KR')}</span>
            </>
          )}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">대기 중인 이체 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y overflow-hidden">
          {rows.map((r) => (
            <DepositRow
              key={r.id}
              request={{
                id: r.id,
                amount: Number(r.amount),
                depositorName: r.depositor_name,
                createdAt: r.created_at,
                userName: r.profiles?.name ?? '—',
                userEmail: r.profiles?.email ?? '—',
                userPhone: r.profiles?.phone ?? '—',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
