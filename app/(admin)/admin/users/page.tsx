import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';

export const dynamic = 'force-dynamic';

type UserRow = { id: string; name: string; email: string; deposit_balance: number; low_balance_threshold: number; status: string; role: string };

export default async function AdminUsersPage({ searchParams }: { searchParams: { filter?: string } }) {
  const supabase = createClient();
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  const list = (users ?? []) as unknown as UserRow[];
  const filter = searchParams.filter;
  const filtered = list.filter(u => {
    if (filter === 'low') return Number(u.deposit_balance) <= Number(u.low_balance_threshold);
    if (filter === 'pending') return u.status === 'pending';
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">사용자 관리</h1>
      <div className="flex gap-2">
        <Link href="/admin/users"><Badge variant={!filter ? 'default' : 'secondary'}>전체</Badge></Link>
        <Link href="/admin/users?filter=low"><Badge variant={filter === 'low' ? 'default' : 'secondary'}>잔액 낮음</Badge></Link>
        <Link href="/admin/users?filter=pending"><Badge variant={filter === 'pending' ? 'default' : 'secondary'}>승인 대기</Badge></Link>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>
              <th className="p-2 text-left">이름</th><th className="p-2 text-left">이메일</th>
              <th className="p-2 text-right">잔액</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">역할</th>
            </tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-2"><Link href={`/admin/users/${u.id}`} className="underline">{u.name}</Link></td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2 text-right">{formatKRW(Number(u.deposit_balance))}</td>
                  <td className="p-2"><Badge variant={u.status === 'active' ? 'default' : 'secondary'}>{u.status}</Badge></td>
                  <td className="p-2">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
