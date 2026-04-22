import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';

export const dynamic = 'force-dynamic';

type UserRow = { id: string; name: string; email: string; phone: string; deposit_balance: number; low_balance_threshold: number };

export default async function LowBalancePage() {
  const supabase = createClient();
  const { data: users } = await supabase.from('profiles')
    .select('id,name,email,phone,deposit_balance,low_balance_threshold')
    .eq('role', 'user').eq('status', 'active');

  const list = (users ?? []) as unknown as UserRow[];
  const low = list.filter(u => Number(u.deposit_balance) <= Number(u.low_balance_threshold));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">잔액 부족 고객</h1>
      <p className="text-sm text-muted-foreground">{low.length}명 — 전화/카톡/문자로 개별 안내해주세요.</p>
      {low.length === 0 ? <p className="text-muted-foreground">해당 고객이 없습니다.</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {low.map(u => (
            <Card key={u.id}><CardContent className="p-4">
              <p className="font-semibold">{u.name}</p>
              <p className="text-sm">{u.phone}</p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
              <p className="text-sm mt-2">현재 잔액: <span className="font-semibold">{formatKRW(Number(u.deposit_balance))}</span></p>
              <p className="text-xs text-muted-foreground">임계치: {formatKRW(Number(u.low_balance_threshold))}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
