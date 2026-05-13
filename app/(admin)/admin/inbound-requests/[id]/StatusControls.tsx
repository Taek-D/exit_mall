'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { setInboundStatusAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

type Transition = {
  next: 'in_progress' | 'completed' | 'cancelled';
  title: string;
  description?: string;
  tone?: 'default' | 'destructive';
};

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
  const { confirm, element } = useConfirm();

  async function go(t: Transition) {
    const result = await confirm({
      title: t.title,
      description: t.description,
      confirmLabel: '진행',
      cancelLabel: '닫기',
      tone: t.tone,
    });
    if (!result.ok) return;
    start(async () => {
      const r = await setInboundStatusAction(requestId, t.next);
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
      <>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              go({ next: 'in_progress', title: '진행중으로 변경할까요?' })
            }
          >
            진행중으로
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              go({
                next: 'cancelled',
                title: '이 요청을 취소할까요?',
                description: '취소하면 되돌릴 수 없습니다.',
                tone: 'destructive',
              })
            }
          >
            취소
          </Button>
        </div>
        {element}
      </>
    );
  }
  if (status === 'in_progress') {
    return (
      <>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => go({ next: 'completed', title: '완료 처리할까요?' })}
          >
            완료 처리
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              go({
                next: 'cancelled',
                title: '이 요청을 취소할까요?',
                description: '취소하면 되돌릴 수 없습니다.',
                tone: 'destructive',
              })
            }
          >
            취소
          </Button>
        </div>
        {element}
      </>
    );
  }
  return <p className="text-xs text-muted-foreground">종결됨 — 추가 액션 없음</p>;
}
