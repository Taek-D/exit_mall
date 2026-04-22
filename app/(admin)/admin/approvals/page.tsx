import { createClient } from '@/lib/supabase/server';
import { ApprovalRow } from './ApprovalRow';

export const dynamic = 'force-dynamic';

type Pending = { id: string; email: string; name: string; phone: string; created_at: string };

export default async function ApprovalsPage() {
  const supabase = createClient();
  const { data: pending } = await supabase.from('profiles')
    .select('id,email,name,phone,created_at').eq('status', 'pending').order('created_at');
  const list = (pending ?? []) as unknown as Pending[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">가입 승인</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">대기 중인 가입 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {list.map(p => <ApprovalRow key={p.id} profile={p} />)}
        </div>
      )}
    </div>
  );
}
