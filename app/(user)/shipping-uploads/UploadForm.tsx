'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { requestShippingUploadAction } from '@/lib/actions/shipping-upload';

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">배송대행 양식 업로드</h3>
      <input
        type="file"
        accept=".xlsx"
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
            const r = await requestShippingUploadAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            toast({
              title: '검토 요청 완료',
              description: '관리자가 승인하면 발송이 시작됩니다.',
            });
            router.push(`/shipping-uploads/${r.uploadId}`);
            router.refresh();
          })
        }
      >
        {pending ? '업로드 중…' : '검토 요청'}
      </Button>
    </div>
  );
}
