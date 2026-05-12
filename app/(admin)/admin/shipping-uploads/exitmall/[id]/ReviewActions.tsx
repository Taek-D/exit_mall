'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  approveShippingUploadAction,
  rejectShippingUploadAction,
} from '@/lib/actions/admin-shipping-uploads';

export function ReviewActions({ uploadId }: { uploadId: string }) {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

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
        <Button
          disabled={pending}
          className="flex-1"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await approveShippingUploadAction(uploadId);
              if (!r.ok) {
                setError(r.error ?? '승인 실패');
                return;
              }
              toast({
                title: '승인 완료',
                description: '보유 재고와 배송비가 차감되었습니다.',
              });
              router.refresh();
            })
          }
        >
          승인 (재고/배송비 차감)
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          className="flex-1"
          onClick={() =>
            start(async () => {
              setError(null);
              if (!memo.trim()) {
                setError('반려 사유를 입력해주세요.');
                return;
              }
              const r = await rejectShippingUploadAction(uploadId, memo.trim());
              if (!r.ok) {
                setError(r.error ?? '반려 실패');
                return;
              }
              toast({ title: '반려되었습니다' });
              router.refresh();
            })
          }
        >
          반려
        </Button>
      </div>
    </div>
  );
}
