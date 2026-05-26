'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { requestPurchasedShippingUploadAction } from '@/lib/actions/shipping-upload';

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">사입재고 배송대행 양식 업로드</h3>
      <p className="text-xs text-muted-foreground">
        품목명은 입고리스트의 상품명, 내품명은 옵션과 정확히 일치해야 합니다.
      </p>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        disabled={!file || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            const r = await requestPurchasedShippingUploadAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            toast({
              title: '검토 요청 완료',
              description: '관리자 승인 후 입고완료 재고가 차감됩니다.',
            });
            router.push(`/shipping-uploads/purchased/${r.uploadId}`);
            router.refresh();
          })
        }
      >
        {pending ? '업로드 중...' : '검토 요청'}
      </Button>
    </div>
  );
}
