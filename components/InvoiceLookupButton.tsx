import { ExternalLink } from 'lucide-react';
import { getTrackingUrl } from '@/lib/tracking';

export function InvoiceLookupButton({ tracking }: { tracking: string }) {
  const url = getTrackingUrl('CJ대한통운', tracking);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 h-7 px-2 rounded bg-surface-muted text-[11px] hover:bg-muted"
    >
      CJ 조회
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}
