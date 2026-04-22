'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTransition } from 'react';
import { updateThresholdAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function ThresholdForm({ userId, defaultValue }: { userId: string; defaultValue: number }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await updateThresholdAction(userId, fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '임계치 변경 완료' }); router.refresh(); }
    });
  }
  return (
    <Card><CardContent className="p-4 space-y-2">
      <h3 className="font-semibold">잔액 부족 임계치</h3>
      <form action={onSubmit as unknown as (fd: FormData) => void} className="space-y-2">
        <div><Label>임계치 (원)</Label><Input name="threshold" type="number" min={0} defaultValue={defaultValue} required /></div>
        <Button type="submit" disabled={pending} className="w-full">저장</Button>
      </form>
    </CardContent></Card>
  );
}
