'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  approveOrderUploadAction,
  rejectOrderUploadAction,
} from '@/lib/actions/admin-order-uploads';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle } from 'lucide-react';

export function ReviewActions({ uploadId }: { uploadId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, element } = useConfirm();

  async function onApprove() {
    const res = await confirm({
      title: '주문서를 승인할까요?',
      description:
        '승인하면 고객의 예치금이 즉시 차감되고 정식 주문이 생성돼요. 이 동작은 되돌릴 수 없어요.',
      confirmLabel: '승인',
    });
    if (!res.ok) return;
    start(async () => {
      const r = await approveOrderUploadAction(uploadId);
      if (!r.ok) {
        toast({ title: '승인 실패', description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '승인 완료', description: '주문이 정식 등록되었어요.' });
      router.push(`/admin/orders/${r.orderId}`);
      router.refresh();
    });
  }

  async function onReject() {
    const res = await confirm({
      title: '주문서를 반려할까요?',
      description: '입력한 반려 사유는 고객에게 그대로 노출돼요.',
      confirmLabel: '반려',
      tone: 'destructive',
      requireReason: true,
      reasonLabel: '반려 사유',
      reasonPlaceholder: '예: 단가가 마스터 차트와 일치하지 않습니다.',
    });
    if (!res.ok) return;
    start(async () => {
      const r = await rejectOrderUploadAction(uploadId, res.reason);
      if (!r.ok) {
        toast({ title: '반려 실패', description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '반려 처리 완료' });
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onReject} disabled={pending}>
          <XCircle className="h-4 w-4" aria-hidden />
          반려
        </Button>
        <Button onClick={onApprove} disabled={pending}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {pending ? '처리 중…' : '승인'}
        </Button>
      </div>
      {element}
    </>
  );
}
