'use client';
import { Copy, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { groupInboundShipments } from '@/lib/inbound/tracking';
import type { InboundRequestItem } from '@/lib/inbound/queries';

export function InboundShipmentList({ items }: { items: InboundRequestItem[] }) {
  const { toast } = useToast();
  const { shipments, missingCount } = groupInboundShipments(items);

  if (!shipments.length && !missingCount) return null;

  async function copy(tracking: string) {
    try {
      await navigator.clipboard.writeText(tracking);
      toast({ title: '송장번호를 복사했습니다.' });
    } catch {
      toast({ title: '복사할 수 없습니다.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">배송 정보</p>
      <ul className="space-y-1.5">
        {shipments.map((s) => (
          <li
            key={s.tracking}
            className="flex items-center gap-2.5 rounded-md bg-surface-muted px-3 py-2"
          >
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm tabular tracking-wide">{s.tracking}</p>
              <p className="text-[11px] text-muted-foreground">
                {s.carrier ?? '택배사 미기재'} · 품목 {s.itemCount}건
              </p>
            </div>
            <button
              type="button"
              onClick={() => copy(s.tracking)}
              aria-label={`송장번호 ${s.tracking} 복사`}
              className="shrink-0 rounded-md border px-2 py-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {missingCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          송장번호가 비어 있는 품목 {missingCount}건이 있어 도착한 박스와 대조할 수 없습니다.
        </p>
      )}
    </div>
  );
}
