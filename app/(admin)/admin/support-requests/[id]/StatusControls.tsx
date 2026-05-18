'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { setSupportStatusAction } from '@/lib/actions/support-request';
import type { SupportStatus } from '@/lib/types';

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
  status: SupportStatus;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, element } = useConfirm();
  const disabled = pending || confirming;

  async function go(transition: Transition) {
    if (disabled) return;

    setConfirming(true);
    const result = await confirm({
      title: transition.title,
      description: transition.description,
      confirmLabel: '진행',
      cancelLabel: '닫기',
      tone: transition.tone,
    });
    if (!result.ok) {
      setConfirming(false);
      return;
    }

    start(async () => {
      try {
        const actionResult = await setSupportStatusAction(requestId, transition.next);
        if (!actionResult.ok) {
          toast({ title: '변경 실패', description: actionResult.error, variant: 'destructive' });
          return;
        }
        toast({ title: '상태가 변경되었습니다.' });
        router.refresh();
      } finally {
        setConfirming(false);
      }
    });
  }

  if (status === 'open') {
    return (
      <>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => go({ next: 'in_progress', title: '처리중으로 변경할까요?' })}
          >
            처리중으로
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              go({
                next: 'cancelled',
                title: '이 문의를 취소할까요?',
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
            disabled={disabled}
            onClick={() => go({ next: 'completed', title: '완료 처리할까요?' })}
          >
            완료 처리
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              go({
                next: 'cancelled',
                title: '이 문의를 취소할까요?',
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
