'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { cancelInboundRequestAction } from '@/lib/actions/inbound-request';

export function CancelInboundButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, element } = useConfirm();

  async function onCancel() {
    const result = await confirm({
      title: '이 입고요청을 취소할까요?',
      description: '취소하면 되돌릴 수 없습니다.',
      confirmLabel: '취소',
      cancelLabel: '닫기',
      tone: 'destructive',
    });
    if (!result.ok) return;
    start(async () => {
      const r = await cancelInboundRequestAction(requestId);
      if (!r.ok) {
        toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '취소되었습니다.' });
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
        {pending ? '처리 중…' : '취소'}
      </Button>
      {element}
    </>
  );
}
