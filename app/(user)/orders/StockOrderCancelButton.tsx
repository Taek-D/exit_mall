'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelStockOrderAction } from '@/lib/actions/stock-order';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function StockOrderCancelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelStockOrderAction(orderId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '검토 요청을 취소했습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '취소 중…' : '취소'}
    </Button>
  );
}
