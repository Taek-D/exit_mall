'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTransition } from 'react';
import { updateThresholdAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';

export function ThresholdForm({
  userId,
  defaultValue,
}: {
  userId: string;
  defaultValue: number;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await updateThresholdAction(userId, fd);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '임계치 변경 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">잔액 부족 임계치</h2>
      </header>
      <form action={onSubmit as unknown as (fd: FormData) => void} className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="threshold">임계치</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono"
              aria-hidden
            >
              ₩
            </span>
            <Input
              id="threshold"
              name="threshold"
              type="number"
              min={0}
              defaultValue={defaultValue}
              required
              className="pl-7 font-mono tabular"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            이 금액 이하일 때 잔액 부족 페이지에 노출됩니다.
          </p>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? '저장 중…' : '저장'}
        </Button>
      </form>
    </section>
  );
}
