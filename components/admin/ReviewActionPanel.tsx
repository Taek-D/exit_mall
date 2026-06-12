'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { ActionResult } from '@/lib/actions/_shared';

type ReviewActionPanelProps = {
  approveLabel: string;
  approveSuccessTitle: string;
  approveSuccessDescription?: string;
  approve: () => Promise<ActionResult>;
  reject: (memo: string) => Promise<ActionResult>;
};

export function ReviewActionPanel({
  approveLabel,
  approveSuccessTitle,
  approveSuccessDescription,
  approve,
  reject,
}: ReviewActionPanelProps) {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function runApprove() {
    setError(null);
    start(async () => {
      const result = await approve();
      if (!result.ok) {
        setError(result.error ?? '승인 실패');
        return;
      }
      toast({
        title: approveSuccessTitle,
        description: approveSuccessDescription,
      });
      router.refresh();
    });
  }

  function runReject() {
    setError(null);
    const rejectionMemo = memo.trim();
    if (!rejectionMemo) {
      setError('반려 사유를 입력해주세요.');
      return;
    }

    start(async () => {
      const result = await reject(rejectionMemo);
      if (!result.ok) {
        setError(result.error ?? '반려 실패');
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
        <Button onClick={runApprove} disabled={pending} className="flex-1">
          {approveLabel}
        </Button>
        <Button onClick={runReject} disabled={pending} variant="outline" className="flex-1">
          반려
        </Button>
      </div>
    </div>
  );
}
