'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  markPreparingAction,
  markShippedAction,
  markDeliveredAction,
  adminCancelOrderAction,
} from '@/lib/actions/admin-orders';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@/lib/types';
import { ArrowRight, Truck, CheckCircle2, XCircle, Workflow } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

export function TransitionButtons({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const { confirm, element: confirmElement } = useConfirm();

  function run(fn: () => Promise<{ error?: string }>, success: string) {
    start(async () => {
      const r = await fn();
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else {
        toast({ title: success });
        router.refresh();
      }
    });
  }

  async function cancel() {
    const res = await confirm({
      title: '주문을 취소할까요?',
      description: '취소하면 결제된 예치금이 고객에게 환불돼요. 되돌릴 수 없어요.',
      confirmLabel: '주문 취소',
      tone: 'destructive',
    });
    if (!res.ok) return;
    run(() => adminCancelOrderAction(orderId), '주문 취소 완료');
  }

  const terminal = status === 'delivered' || status === 'cancelled';

  return (
    <>
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-5 flex items-center gap-2 border-b">
        <Workflow className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">상태 전이</h2>
      </header>
      <div className="p-5 space-y-4">
        {status === 'placed' && (
          <Button
            onClick={() => run(() => markPreparingAction(orderId), '준비중으로 변경')}
            disabled={pending}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            준비중으로
          </Button>
        )}

        {status === 'preparing' && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="carrier">택배사</Label>
              <Input
                id="carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="예: CJ대한통운"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tracking">송장번호</Label>
              <Input
                id="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="font-mono tabular"
              />
            </div>
            <Button
              onClick={() =>
                run(() => markShippedAction(orderId, tracking, carrier), '발송 처리 완료')
              }
              disabled={pending || !tracking || !carrier}
            >
              <Truck className="h-4 w-4" aria-hidden />
              발송 처리
            </Button>
          </div>
        )}

        {status === 'shipped' && (
          <Button
            onClick={() => run(() => markDeliveredAction(orderId), '배송 완료 처리')}
            disabled={pending}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            배송 완료로
          </Button>
        )}

        {!terminal && (
          <Button variant="destructive" onClick={cancel} disabled={pending}>
            <XCircle className="h-4 w-4" aria-hidden />
            주문 취소 (환불)
          </Button>
        )}

        {terminal && (
          <p className="text-sm text-muted-foreground">
            전이할 상태가 없습니다. 주문이 종결 상태입니다.
          </p>
        )}
      </div>
    </section>
    {confirmElement}
    </>
  );
}
