'use client';
import { useCart } from '@/components/CartProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';
import Image from 'next/image';
import Link from 'next/link';

export default function CartPage() {
  const { items, updateQty, remove, total, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">장바구니가 비어있습니다.</p>
        <Button asChild><Link href="/shop">상품 보러가기</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">장바구니</h1>
      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.productId}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative w-16 h-16 bg-muted rounded">
                {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-cover rounded" sizes="64px" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatKRW(item.price)}</p>
              </div>
              <Input
                type="number" min={1} className="w-20"
                value={item.quantity}
                onChange={e => updateQty(item.productId, parseInt(e.target.value, 10) || 1)}
              />
              <p className="w-24 text-right font-semibold">{formatKRW(item.price * item.quantity)}</p>
              <Button variant="ghost" size="sm" onClick={() => remove(item.productId)}>삭제</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-lg">합계</p>
          <p className="text-2xl font-bold">{formatKRW(total)}</p>
        </CardContent>
      </Card>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={clear}>비우기</Button>
        <Button asChild><Link href="/checkout">주문하기</Link></Button>
      </div>
    </div>
  );
}
