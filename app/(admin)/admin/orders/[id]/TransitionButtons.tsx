'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { markPreparingAction, markShippedAction, markDeliveredAction, adminCancelOrderAction } from '@/lib/actions/admin-orders';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@/lib/types';

export function TransitionButtons({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');

  function run(fn: () => Promise<any>, success: string) {
    start(async () => {
      const r = await fn();
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: success }); router.refresh(); }
    });
  }

  function cancel() {
    if (!confirm('주문을 취소하시겠습니까? 잔액이 환불됩니다.')) return;
    run(() => adminCancelOrderAction(orderId), '주문 취소 완료');
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="font-semibold">상태 전이</h2>
        {status === 'placed' && <Button onClick={() => run(() => markPreparingAction(orderId), '준비중으로 변경')} disabled={pending}>준비중으로</Button>}
        {status === 'preparing' && (
          <div className="space-y-2">
            <div><Label>택배사 *</Label><Input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="예: CJ대한통운" /></div>
            <div><Label>송장번호 *</Label><Input value={tracking} onChange={e => setTracking(e.target.value)} /></div>
            <Button onClick={() => run(() => markShippedAction(orderId, tracking, carrier), '발송 처리 완료')} disabled={pending || !tracking || !carrier}>발송 처리</Button>
          </div>
        )}
        {status === 'shipped' && <Button onClick={() => run(() => markDeliveredAction(orderId), '배송 완료 처리')} disabled={pending}>배송 완료로</Button>}
        {status !== 'cancelled' && status !== 'delivered' && (
          <Button variant="destructive" onClick={cancel} disabled={pending}>주문 취소 (환불)</Button>
        )}
        {(status === 'delivered' || status === 'cancelled') && <p className="text-sm text-muted-foreground">전이할 상태가 없습니다.</p>}
      </CardContent>
    </Card>
  );
}
