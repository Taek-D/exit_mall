import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKRW } from '@/lib/money';
import { DEPOSIT_STATUS_LABEL, type DepositStatus } from '@/lib/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Req = { id: string; amount: number; depositor_name: string; status: string; admin_memo: string | null; created_at: string; confirmed_at: string | null };

function statusVariant(s: DepositStatus): 'default'|'secondary'|'destructive' {
  return s === 'confirmed' ? 'default' : s === 'rejected' ? 'destructive' : 'secondary';
}

export default async function DepositListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('deposit_balance').eq('id', user!.id)
    .single<{ deposit_balance: number }>();
  const { data: requests } = await supabase.from('deposit_requests')
    .select('id,amount,depositor_name,status,admin_memo,created_at,confirmed_at')
    .order('created_at', { ascending: false });

  const reqs = (requests ?? []) as unknown as Req[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">예치금</h1>
        <Button asChild><Link href="/deposit/new">이체 요청</Link></Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span>현재 잔액</span>
          <span className="text-2xl font-bold">{formatKRW(Number(profile?.deposit_balance ?? 0))}</span>
        </CardContent>
      </Card>

      <h2 className="font-semibold mt-6">이체 요청 내역</h2>
      {reqs.length === 0 ? (
        <p className="text-muted-foreground">요청 내역이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {reqs.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{formatKRW(Number(r.amount))}</p>
                  <p className="text-sm text-muted-foreground">입금자명: {r.depositor_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                  {r.admin_memo && <p className="text-xs text-destructive">사유: {r.admin_memo}</p>}
                </div>
                <Badge variant={statusVariant(r.status as DepositStatus)}>{DEPOSIT_STATUS_LABEL[r.status as DepositStatus]}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
