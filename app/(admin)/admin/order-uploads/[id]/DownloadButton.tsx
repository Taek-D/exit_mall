'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getOrderUploadDownloadUrl } from '@/lib/actions/admin-order-uploads';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DownloadButton({ storagePath }: { storagePath: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function onClick() {
    start(async () => {
      const r = await getOrderUploadDownloadUrl(storagePath);
      if (!r.ok) {
        toast({ title: '다운로드 실패', description: r.error, variant: 'destructive' });
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <Download className="h-3.5 w-3.5" aria-hidden />
      {pending ? '준비 중…' : '원본 다운로드'}
    </Button>
  );
}
