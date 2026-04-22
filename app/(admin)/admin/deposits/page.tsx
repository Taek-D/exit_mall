import { createClient } from '@/lib/supabase/server';
import { DepositRow } from './DepositRow';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; amount: number; depositor_name: string; created_at: string; user_id: string;
  profiles: { name: string; email: string; phone: string } | null;
};

export default async function AdminDepositsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('deposit_requests')
    .select('id,amount,depositor_name,created_at,user_id,profiles!inner(name,email,phone)')
    .eq('status', 'pending').order('created_at');

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">입금 확인</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">대기 중인 이체 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <DepositRow key={r.id} request={{
              id: r.id, amount: Number(r.amount), depositorName: r.depositor_name,
              createdAt: r.created_at,
              userName: r.profiles?.name ?? '-', userEmail: r.profiles?.email ?? '-', userPhone: r.profiles?.phone ?? '-',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
