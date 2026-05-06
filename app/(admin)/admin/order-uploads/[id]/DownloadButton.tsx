'use client';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getOrderUploadDownloadUrl } from '@/lib/actions/admin-order-uploads';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DownloadButton({
  storagePath,
  originalName,
}: {
  storagePath: string;
  originalName?: string;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function onClick() {
    start(async () => {
      const r = await getOrderUploadDownloadUrl(storagePath, originalName);
      if (!r.ok) {
        toast({ title: '다운로드 실패', description: r.error, variant: 'destructive' });
        return;
      }
      // Anchor-click pattern avoids popup blockers (Safari/Chrome block
      // window.open() called after an awaited promise). The signed URL is
      // generated with `download: <name>`, so Supabase serves it with
      // Content-Disposition: attachment and the browser saves it without
      // navigating away.
      const a = document.createElement('a');
      a.href = r.url;
      a.rel = 'noopener noreferrer';
      if (originalName) a.download = originalName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <Download className="h-3.5 w-3.5" aria-hidden />
      {pending ? '준비 중…' : '원본 다운로드'}
    </Button>
  );
}
