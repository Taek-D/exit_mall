'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTransition } from 'react';
import { adjustBalanceAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';

export function BalanceAdjustForm({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await adjustBalanceAction(userId, fd);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '잔액 조정 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">잔액 수동 조정</h2>
      </header>
      <form action={onSubmit as unknown as (fd: FormData) => void} className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="delta">증감액</Label>
          <Input
            id="delta"
            name="delta"
            type="number"
            required
            placeholder="음수 입력 시 차감"
            className="font-mono tabular"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="memo">사유</Label>
          <Textarea id="memo" name="memo" required rows={2} />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? '처리 중…' : '조정'}
        </Button>
      </form>
    </section>
  );
}
