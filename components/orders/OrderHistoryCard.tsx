import type { ReactNode } from 'react';
import { formatDateTimeKR } from '@/lib/dates';
import { formatKRW } from '@/lib/money';

export type OrderHistoryItem = {
  name: string;
  quantity: number;
  subtotal: number;
};

type OrderHistoryCardProps = {
  id: string;
  createdAt: string;
  statusBadge: ReactNode;
  items: OrderHistoryItem[];
  totalAmount: number;
  children?: ReactNode;
  footerAction?: ReactNode;
};

export function OrderHistoryCard({
  id,
  createdAt,
  statusBadge,
  items,
  totalAmount,
  children,
  footerAction,
}: OrderHistoryCardProps) {
  return (
    <article className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 p-4 border-b">
        <span className="font-mono text-xs text-muted-foreground truncate">
          주문번호 {id.slice(0, 8)} · {formatDateTimeKR(createdAt)}
        </span>
        {statusBadge}
      </header>
      <div className="p-4 space-y-1 text-sm">
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex justify-between gap-3">
            <span>
              <span className="text-foreground">{item.name}</span>
              <span className="text-muted-foreground"> × {item.quantity}</span>
            </span>
            <span className="font-mono tabular text-muted-foreground">
              {formatKRW(item.subtotal)}
            </span>
          </div>
        ))}
      </div>
      {children}
      <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-surface-muted/40">
        <span className="font-mono tabular text-lg font-semibold">
          {formatKRW(Number(totalAmount))}
        </span>
        {footerAction}
      </footer>
    </article>
  );
}
