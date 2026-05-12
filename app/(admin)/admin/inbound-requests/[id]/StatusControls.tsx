'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { setInboundStatusAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export function StatusControls({
  requestId,
  status,
}: {
  requestId: string;
  status: InboundStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function go(next: 'in_progress' | 'completed' | 'cancelled', confirmText: string) {
    start(async () => {
      if (!confirm(confirmText)) return;
      const r = await setInboundStatusAction(requestId, next);
      if (!r.ok) {
        toast({ title: '변경 실패', description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '상태가 변경되었습니다.' });
      router.refresh();
    });
  }

  if (status === 'open') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('in_progress', '진행중으로 변경할까요?')}>
          진행중으로
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => go('cancelled', '이 요청을 취소할까요?')}
        >
          취소
        </Button>
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('completed', '완료 처리할까요?')}>
          완료 처리
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => go('cancelled', '이 요청을 취소할까요?')}
        >
          취소
        </Button>
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground">종결됨 — 추가 액션 없음</p>;
}
