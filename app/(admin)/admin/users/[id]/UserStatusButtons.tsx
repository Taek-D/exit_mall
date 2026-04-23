'use client';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { setUserStatusAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Check, Ban } from 'lucide-react';
import { UserStatusBadge } from '@/components/StatusBadge';
import type { UserStatus } from '@/lib/types';

export function UserStatusButtons({
  userId,
  status,
}: {
  userId: string;
  status: UserStatus;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function run(next: 'active' | 'suspended') {
    start(async () => {
      const r = await setUserStatusAction(userId, next);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '상태 변경 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">계정 상태</h2>
      </header>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">현재</span>
          <UserStatusBadge status={status} />
        </div>
        <div className="flex gap-2">
          {status !== 'active' && (
            <Button size="sm" onClick={() => run('active')} disabled={pending} className="flex-1">
              <Check className="h-3.5 w-3.5" aria-hidden />
              활성화
            </Button>
          )}
          {status !== 'suspended' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => run('suspended')}
              disabled={pending}
              className="flex-1"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              정지
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
