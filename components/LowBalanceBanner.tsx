import { formatKRW } from '@/lib/money';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

export function LowBalanceBanner({ balance, threshold }: { balance: number; threshold: number }) {
  if (balance > threshold) return null;
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <Alert variant="destructive">
        <AlertDescription>
          잔액이 부족합니다 ({formatKRW(balance)}). <Link href="/deposit/new" className="underline">예치금 충전</Link>을 진행해주세요.
        </AlertDescription>
      </Alert>
    </div>
  );
}
