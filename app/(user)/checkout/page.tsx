'use client';
import { useCart } from '@/components/CartProvider';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { placeOrderAction } from '@/lib/actions/order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  const [shipping, setShipping] = useState({ name: '', phone: '', address: '', memo: '' });

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
      const result = await placeOrderAction({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        shipping,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.productId) remove(result.productId);
        return;
      }
      clear();
      toast({ title: '주문이 접수되었습니다', description: '주문 내역에서 진행 상황을 확인하세요.' });
      router.push('/orders');
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">주문서 작성</h1>
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
              <h2 className="font-heading font-semibold">배송 정보</h2>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">받는 사람 *</Label>
                <Input
                  id="name"
                  required
                  value={shipping.name}
                  onChange={(e) => setShipping({ ...shipping, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">연락처 *</Label>
                <Input
                  id="phone"
                  required
                  placeholder="010-1234-5678"
                  value={shipping.phone}
                  onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">주소 *</Label>
                <Input
                  id="address"
                  required
                  value={shipping.address}
                  onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="memo">배송 메모</Label>
                <Textarea
                  id="memo"
                  rows={3}
                  placeholder="문 앞에 두어주세요"
                  value={shipping.memo}
                  onChange={(e) => setShipping({ ...shipping, memo: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="p-5 border-b">
              <h2 className="font-heading font-semibold">결제 수단</h2>
            </div>
            <div className="p-5">
              <div className="rounded-md border bg-accent/5 p-4 flex items-center gap-3">
                <Wallet className="h-5 w-5 text-accent" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium text-sm">예치금 결제</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    보유 예치금에서 주문 금액만큼 차감됩니다.
                  </p>
                </div>
              </div>
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
              <span className="font-medium">총 결제 금액</span>
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
            {pending ? '주문 처리 중…' : `${formatKRW(total)} 결제`}
          </Button>
        </aside>
      </div>
    </div>
  );
}
