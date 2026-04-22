import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import { BalanceAdjustForm } from './BalanceAdjustForm';
import { UserStatusButtons } from './UserStatusButtons';
import { ThresholdForm } from './ThresholdForm';

export const dynamic = 'force-dynamic';

type Profile = {
  id: string; name: string; email: string; phone: string; role: string; status: string;
  deposit_balance: number; low_balance_threshold: number;
};
type Order = { id: string; total_amount: number; status: string; created_at: string };
type DepositReq = { id: string; amount: number; depositor_name: string; status: string; created_at: string };
type BalTx = { id: string; type: string; amount: number; balance_after: number; memo: string | null; created_at: string };

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: u }, { data: orders }, { data: deposits }, { data: txs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).single<Profile>(),
    supabase.from('orders').select('id,total_amount,status,created_at').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('deposit_requests').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('balance_transactions').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
  ]);
  if (!u) notFound();

  const ol = (orders ?? []) as unknown as Order[];
  const dl = (deposits ?? []) as unknown as DepositReq[];
  const tl = (txs ?? []) as unknown as BalTx[];
  const totalSpent = ol.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_amount), 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">{u.name}</h1>
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-muted-foreground">이메일</p><p>{u.email}</p></div>
          <div><p className="text-muted-foreground">연락처</p><p>{u.phone}</p></div>
          <div><p className="text-muted-foreground">잔액</p><p className="font-bold">{formatKRW(Number(u.deposit_balance))}</p></div>
          <div><p className="text-muted-foreground">총 사용액</p><p>{formatKRW(totalSpent)}</p></div>
          <div><p className="text-muted-foreground">상태</p><p>{u.status}</p></div>
          <div><p className="text-muted-foreground">역할</p><p>{u.role}</p></div>
          <div><p className="text-muted-foreground">임계치</p><p>{formatKRW(Number(u.low_balance_threshold))}</p></div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <BalanceAdjustForm userId={u.id} />
        <ThresholdForm userId={u.id} defaultValue={Number(u.low_balance_threshold)} />
        <UserStatusButtons userId={u.id} status={u.status as any} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">주문 이력</TabsTrigger>
          <TabsTrigger value="deposits">이체 이력</TabsTrigger>
          <TabsTrigger value="ledger">원장</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">주문번호</th><th className="p-2 text-right">금액</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{ol.map(o => (
              <tr key={o.id} className="border-t"><td className="p-2">{o.id.slice(0,8)}</td><td className="p-2 text-right">{formatKRW(Number(o.total_amount))}</td><td className="p-2">{o.status}</td><td className="p-2">{new Date(o.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
        <TabsContent value="deposits">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">금액</th><th className="p-2 text-left">입금자명</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{dl.map(d => (
              <tr key={d.id} className="border-t"><td className="p-2">{formatKRW(Number(d.amount))}</td><td className="p-2">{d.depositor_name}</td><td className="p-2">{d.status}</td><td className="p-2">{new Date(d.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">종류</th><th className="p-2 text-right">증감</th><th className="p-2 text-right">잔액</th><th className="p-2 text-left">메모</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{tl.map(t => (
              <tr key={t.id} className="border-t"><td className="p-2">{t.type}</td><td className="p-2 text-right">{formatKRW(Number(t.amount))}</td><td className="p-2 text-right">{formatKRW(Number(t.balance_after))}</td><td className="p-2">{t.memo ?? '-'}</td><td className="p-2">{new Date(t.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
