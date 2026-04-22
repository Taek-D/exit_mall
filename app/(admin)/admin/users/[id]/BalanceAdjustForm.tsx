'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTransition } from 'react';
import { adjustBalanceAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function BalanceAdjustForm({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await adjustBalanceAction(userId, fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '잔액 조정 완료' }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">잔액 수동 조정</h3>
        <form action={onSubmit as unknown as (fd: FormData) => void} className="space-y-2">
          <div><Label>증감액 (음수=차감)</Label><Input name="delta" type="number" required /></div>
          <div><Label>사유</Label><Textarea name="memo" required /></div>
          <Button type="submit" disabled={pending} className="w-full">{pending ? '처리중...' : '조정'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
