'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelSupportRequestAction } from '@/lib/actions/support-request';

export function CancelSupportRequestButton({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, element } = useConfirm();

  async function onCancel() {
    if (pending) return;

    const result = await confirm({
      title: '문의를 취소할까요?',
      description: '취소하면 되돌릴 수 없습니다.',
      confirmLabel: '취소',
      cancelLabel: '닫기',
      tone: 'destructive',
    });
    if (!result.ok) return;

    setPending(true);
    try {
      const actionResult = await cancelSupportRequestAction(requestId);
      if (!actionResult.ok) {
        toast({ title: '취소 실패', description: actionResult.error, variant: 'destructive' });
        return;
      }
      toast({ title: '취소되었습니다.' });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
        {pending ? '처리 중...' : '취소'}
      </Button>
      {element}
    </>
  );
}
