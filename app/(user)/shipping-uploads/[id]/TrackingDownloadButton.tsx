'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTrackingExcelUrl } from '@/lib/actions/admin-attach-tracking';

export function TrackingDownloadButton({
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
        const r = await getTrackingExcelUrl(storagePath, originalName);
        setBusy(false);
        if (r.ok) window.location.href = r.url;
        else alert(r.error);
      }}
    >
      <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
      송장 포함 엑셀 다운로드
    </Button>
  );
}
