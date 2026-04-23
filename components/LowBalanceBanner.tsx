import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatKRW } from '@/lib/money';

export function LowBalanceBanner({ balance, threshold }: { balance: number; threshold: number }) {
  if (balance > threshold) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-b border-warning/20 bg-warning/5"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-6 py-2.5 flex items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden />
        <p className="text-foreground">
          예치금 잔액이 부족합니다 —{' '}
          <span className="font-mono tabular font-medium text-warning">{formatKRW(balance)}</span>{' '}
          <span className="text-muted-foreground">(임계치 {formatKRW(threshold)})</span>
        </p>
        <Link
          href="/deposit/new"
          className="ml-auto inline-flex items-center gap-1 text-warning hover:text-warning/80 font-medium shrink-0"
        >
          <span>이체 요청</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
