'use client';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelOrderAction } from '@/lib/actions/order';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function OrderCancelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function handle() {
    if (!confirm('주문을 취소하시겠습니까? 잔액이 복원됩니다.')) return;
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

  return <Button variant="outline" size="sm" onClick={handle} disabled={pending}>{pending ? '...' : '주문 취소'}</Button>;
}
