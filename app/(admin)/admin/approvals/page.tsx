import { createClient } from '@/lib/supabase/server';
import { ApprovalRow } from './ApprovalRow';
import { UserCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Pending = {
  id: string;
  email: string;
  name: string;
  phone: string;
  created_at: string;
};

export default async function ApprovalsPage() {
  const supabase = createClient();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id,email,name,phone,created_at')
    .eq('status', 'pending')
    .order('created_at');
  const list = (pending ?? []) as unknown as Pending[];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono tabular font-medium text-foreground">{list.length}</span>건의
            가입 요청이 승인을 대기 중입니다.
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <UserCheck className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">대기 중인 가입 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y overflow-hidden">
          {list.map((p) => (
            <ApprovalRow key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  );
}
