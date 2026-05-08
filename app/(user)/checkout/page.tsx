'use client';
import { useCart } from '@/components/CartProvider';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestStockOrderAction } from '@/lib/actions/stock-order';
import { cartToStockOrderPayload } from '@/lib/cart-to-stock-order';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Wallet, ShoppingCart } from 'lucide-react';

export default function CheckoutPage() {
  const { items, total, remove, clear } = useCart();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-muted grid place-items-center">
          <ShoppingCart className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="font-medium">장바구니가 비어있습니다</p>
        <Button asChild variant="outline">
          <Link href="/shop">상품 보러가기</Link>
        </Button>
      </div>
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await requestStockOrderAction(cartToStockOrderPayload(items));
      if (!result.ok) {
        setError(result.error);
        if (result.productId) remove(result.productId);
        return;
      }
      clear();
      toast({
        title: '검토 요청이 접수되었습니다',
        description: '관리자가 승인하면 보유 재고에 적립됩니다.',
      });
      router.push('/orders');
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">검토 요청</h1>
        <Link
          href="/cart"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          장바구니로 돌아가기
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 space-y-6">
          <div className="rounded-lg border bg-card">
            <div className="p-5 border-b">
              <h2 className="font-heading font-semibold">결제 수단</h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-md border bg-accent/5 p-4 flex items-center gap-3">
                <Wallet className="h-5 w-5 text-accent" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium text-sm">예치금 결제 (검토 시 차감)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    승인 시점에 예치금이 차감되고 보유 재고에 적립됩니다. 검토대기 동안은 가용 잔액에서 예약만 됩니다.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                실제 발송은{' '}
                <Link href="/shipping-uploads" className="underline">
                  배송대행 업로드
                </Link>{' '}
                메뉴에서 받는사람 명단을 올리면 진행됩니다. 이 단계에서는 배송지를 입력하지 않습니다.
              </p>
            </div>
          </div>
        </section>

        <aside className="lg:col-span-4 self-start space-y-4">
          <div className="rounded-lg border bg-card">
            <div className="p-5 border-b">
              <h2 className="font-heading font-semibold">주문 항목</h2>
            </div>
            <ul className="p-5 space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.productId} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground min-w-0">
                    <span className="text-foreground">{i.name}</span>
                    <span className="text-muted-foreground"> × {i.quantity}</span>
                  </span>
                  <span className="font-mono tabular text-foreground whitespace-nowrap">
                    {formatKRW(i.price * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-4 border-t flex items-baseline justify-between">
              <span className="font-medium">예상 차감액</span>
              <span className="font-mono tabular text-xl font-semibold">{formatKRW(total)}</span>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3 animate-slide-up-fade"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
          )}

          <Button onClick={submit} disabled={pending} className="w-full h-11">
            {pending ? '요청 중…' : `${formatKRW(total)} 검토 요청`}
          </Button>
        </aside>
      </div>
    </div>
  );
}
