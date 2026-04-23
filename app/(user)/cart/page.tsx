'use client';
import { useCart } from '@/components/CartProvider';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag, ImageOff, ArrowRight } from 'lucide-react';

export default function CartPage() {
  const { items, updateQty, remove, total, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-muted grid place-items-center">
          <ShoppingBag className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h1 className="font-heading font-semibold text-lg">장바구니가 비어있습니다</h1>
          <p className="text-sm text-muted-foreground mt-1">상품을 둘러보고 담아보세요.</p>
        </div>
        <Button asChild>
          <Link href="/shop">
            상품 보러가기
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">장바구니</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular font-medium text-foreground">{items.length}</span>종{' '}
          <span className="font-mono tabular font-medium text-foreground">{itemCount}</span>개
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section aria-label="주문 항목" className="lg:col-span-8 rounded-lg border bg-card divide-y">
          {items.map((item) => {
            const sub = item.price * item.quantity;
            return (
              <div key={item.productId} className="flex items-center gap-3 sm:gap-4 p-4">
                <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-md bg-surface-muted overflow-hidden">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="80px" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                      <ImageOff className="h-5 w-5" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground font-mono tabular mt-0.5">
                    {formatKRW(item.price)}
                  </p>
                </div>

                <div className="inline-flex items-center h-9 rounded-md border">
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, Math.max(1, item.quantity - 1))}
                    disabled={item.quantity <= 1}
                    className="h-9 w-9 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent rounded-l-md"
                    aria-label="수량 감소"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span
                    className="w-10 text-center text-sm font-mono tabular font-medium"
                    aria-live="polite"
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, item.quantity + 1)}
                    className="h-9 w-9 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-r-md"
                    aria-label="수량 증가"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                <div className="hidden sm:block w-28 text-right font-mono tabular font-semibold">
                  {formatKRW(sub)}
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.productId)}
                  className="h-9 w-9 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`${item.name} 삭제`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            );
          })}
          <div className="p-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              전체 비우기
            </Button>
          </div>
        </section>

        <aside className="lg:col-span-4 self-start rounded-lg border bg-card">
          <div className="p-5 border-b">
            <h2 className="font-heading font-semibold">주문 요약</h2>
          </div>
          <dl className="p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">상품 금액</dt>
              <dd className="font-mono tabular">{formatKRW(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">배송비</dt>
              <dd className="font-mono tabular text-muted-foreground">주문 시 확인</dd>
            </div>
            <div className="border-t pt-3 flex items-baseline justify-between">
              <dt className="font-medium">예상 결제 금액</dt>
              <dd className="font-mono tabular text-xl font-semibold">{formatKRW(total)}</dd>
            </div>
          </dl>
          <div className="p-5 pt-0">
            <Button asChild className="w-full h-11">
              <Link href="/checkout">
                주문하기
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
