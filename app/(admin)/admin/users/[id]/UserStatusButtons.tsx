'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { setUserStatusAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function UserStatusButtons({ userId, status }: { userId: string; status: 'pending'|'active'|'suspended' }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function run(next: 'active'|'suspended') {
    start(async () => {
      const r = await setUserStatusAction(userId, next);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '상태 변경 완료' }); router.refresh(); }
    });
  }
  return (
    <Card><CardContent className="p-4 space-y-2">
      <h3 className="font-semibold">계정 상태</h3>
      <p className="text-sm">현재: {status}</p>
      <div className="flex gap-2">
        {status !== 'active' && <Button size="sm" onClick={() => run('active')} disabled={pending}>활성화</Button>}
        {status !== 'suspended' && <Button size="sm" variant="destructive" onClick={() => run('suspended')} disabled={pending}>정지</Button>}
      </div>
    </CardContent></Card>
  );
}
