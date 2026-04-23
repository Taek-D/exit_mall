'use client';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelOrderAction } from '@/lib/actions/order';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

export function OrderCancelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, element } = useConfirm();

  async function handle() {
    const res = await confirm({
      title: '주문을 취소할까요?',
      description: '취소하면 결제된 예치금이 자동으로 복원돼요. 이 동작은 되돌릴 수 없어요.',
      confirmLabel: '주문 취소',
      tone: 'destructive',
    });
    if (!res.ok) return;
    start(async () => {
      const result = await cancelOrderAction(orderId);
      if (result.ok) {
        toast({ title: '주문 취소 완료' });
        router.refresh();
      } else {
        toast({ title: '취소 실패', description: result.error, variant: 'destructive' });
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handle} disabled={pending}>
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        {pending ? '처리 중…' : '주문 취소'}
      </Button>
      {element}
    </>
  );
}
