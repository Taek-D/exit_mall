'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrderUploadDownloadUrl } from '@/lib/actions/admin-order-uploads';

export function DownloadButton({
  storagePath,
  originalName,
}: {
  storagePath: string;
  originalName: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await getOrderUploadDownloadUrl(storagePath, originalName);
        setBusy(false);
        if (r.ok) window.location.href = r.url;
        else alert(r.error);
      }}
    >
      <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
      원본 다운로드
    </Button>
  );
}
