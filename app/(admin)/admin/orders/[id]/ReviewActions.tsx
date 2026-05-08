'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  approveStockOrderAction,
  rejectStockOrderAction,
} from '@/lib/actions/admin-stock-orders';

export function ReviewActions({ orderId }: { orderId: string }) {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function approve() {
    setError(null);
    start(async () => {
      const r = await approveStockOrderAction(orderId);
      if (!r.ok) {
        setError(r.error ?? '승인 실패');
        return;
      }
      toast({ title: '승인되었습니다', description: '보유 재고에 적립되었습니다.' });
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    if (!memo.trim()) {
      setError('반려 사유를 입력해주세요.');
      return;
    }
    start(async () => {
      const r = await rejectStockOrderAction(orderId, memo.trim());
      if (!r.ok) {
        setError(r.error ?? '반려 실패');
        return;
      }
      toast({ title: '반려되었습니다' });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">검토 처리</h3>
      <Textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="반려 시 사유를 입력해주세요"
        rows={3}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={approve} disabled={pending} className="flex-1">
          승인 (재고 적립 + 예치금 차감)
        </Button>
        <Button onClick={reject} disabled={pending} variant="outline" className="flex-1">
          반려
        </Button>
      </div>
    </div>
  );
}
