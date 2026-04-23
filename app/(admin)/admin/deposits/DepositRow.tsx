'use client';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { confirmDepositAction, rejectDepositAction } from '@/lib/actions/admin-deposits';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import { Check, X, User } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

type Props = {
  request: {
    id: string;
    amount: number;
    depositorName: string;
    createdAt: string;
    userName: string;
    userEmail: string;
    userPhone: string;
  };
};

export function DepositRow({ request }: Props) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, element } = useConfirm();

  function runConfirm() {
    start(async () => {
      const r = await confirmDepositAction(request.id);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else {
        toast({ title: '입금 확인 완료' });
        router.refresh();
      }
    });
  }

  async function reject() {
    const res = await confirm({
      title: '이체 요청을 반려할까요?',
      description: `${request.userName} 님의 ${formatKRW(request.amount)} 요청을 반려해요. 사유는 고객에게 전달돼요.`,
      confirmLabel: '반려',
      tone: 'destructive',
      requireReason: true,
      reasonLabel: '반려 사유',
      reasonPlaceholder: '예: 입금자명이 일치하지 않습니다',
    });
    if (!res.ok) return;
    start(async () => {
      const r = await rejectDepositAction(request.id, res.reason);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else {
        toast({ title: '반려 완료' });
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 hover:bg-surface-muted/50 transition-colors">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-md bg-accent/10 text-accent grid place-items-center shrink-0">
            <User className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0 grid sm:grid-cols-[1fr_auto] gap-1 sm:gap-8 items-baseline">
            <div className="min-w-0">
              <p className="font-medium truncate">{request.userName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {request.userEmail} · <span className="font-mono tabular">{request.userPhone}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                입금자명 <span className="text-foreground">{request.depositorName}</span> ·{' '}
                {new Date(request.createdAt).toLocaleString('ko-KR', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <p className="font-mono tabular text-lg font-semibold sm:text-right whitespace-nowrap">
              {formatKRW(request.amount)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 sm:self-center">
          <Button size="sm" onClick={runConfirm} disabled={pending} className="flex-1 sm:flex-initial">
            <Check className="h-3.5 w-3.5" aria-hidden />
            확인
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={reject}
            disabled={pending}
            className="flex-1 sm:flex-initial"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            반려
          </Button>
        </div>
      </div>
      {element}
    </>
  );
}
