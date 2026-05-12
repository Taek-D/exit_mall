'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { attachTrackingAction } from '@/lib/actions/admin-attach-tracking';

export function AttachTrackingForm({ uploadId }: { uploadId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">송장 재업로드</h3>
      <p className="text-xs text-muted-foreground">
        원본 엑셀의 송장번호 컬럼을 채워서 다시 업로드하면, 행별 송장이 갱신되고 상태가 &quot;발송중&quot;으로 바뀝니다.
        부분 발송도 가능 — 송장 비어있는 행은 &quot;미발송&quot;으로 표시됩니다. 여러 번 덮어쓸 수 있습니다.
      </p>
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
            const r = await attachTrackingAction(uploadId, fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            toast({
              title: '송장이 등록되었습니다',
              description: '고객 화면에 행별 송장이 노출됩니다.',
            });
            setFile(null);
            router.refresh();
          })
        }
      >
        {pending ? '업로드 중…' : '송장 채운 엑셀 업로드'}
      </Button>
    </div>
  );
}
