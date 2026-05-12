'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelInboundRequestAction } from '@/lib/actions/inbound-request';

export function CancelInboundButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm('이 입고요청을 취소할까요?')) return;
          const r = await cancelInboundRequestAction(requestId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '취소되었습니다.' });
          router.refresh();
        })
      }
    >
      {pending ? '처리 중…' : '취소'}
    </Button>
  );
}
