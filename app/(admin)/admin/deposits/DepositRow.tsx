'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { confirmDepositAction, rejectDepositAction } from '@/lib/actions/admin-deposits';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { formatKRW } from '@/lib/money';

type Props = { request: { id: string; amount: number; depositorName: string; createdAt: string; userName: string; userEmail: string; userPhone: string } };

export function DepositRow({ request }: Props) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function confirm() {
    start(async () => {
      const r = await confirmDepositAction(request.id);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: '입금 확인 완료' }); router.refresh(); }
    });
  }
  function reject() {
    const m = prompt('반려 사유를 입력하세요', '') ?? '';
    if (!m) return;
    start(async () => {
      const r = await rejectDepositAction(request.id, m);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: '반려 완료' }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{request.userName} — {formatKRW(request.amount)}</p>
          <p className="text-sm text-muted-foreground">입금자명: {request.depositorName}</p>
          <p className="text-xs text-muted-foreground">{request.userEmail} · {request.userPhone}</p>
          <p className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString('ko-KR')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={pending}>확인</Button>
          <Button size="sm" variant="outline" onClick={reject} disabled={pending}>반려</Button>
        </div>
      </CardContent>
    </Card>
  );
}
