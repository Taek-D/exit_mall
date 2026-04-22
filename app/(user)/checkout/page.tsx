'use client';
import { useCart } from '@/components/CartProvider';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { placeOrderAction } from '@/lib/actions/order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatKRW } from '@/lib/money';
import { useToast } from '@/hooks/use-toast';

export default function CheckoutPage() {
  const { items, total, remove, clear } = useCart();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [shipping, setShipping] = useState({ name: '', phone: '', address: '', memo: '' });

  if (items.length === 0) {
    return <div className="py-12 text-center"><p>장바구니가 비어있습니다.</p></div>;
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await placeOrderAction({
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        shipping,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.productId) remove(result.productId);
        return;
      }
      clear();
      toast({ title: '주문 완료', description: '주문이 접수되었습니다' });
      router.push('/orders');
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">주문서 작성</h1>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold mb-2">주문 항목</h2>
          {items.map(i => (
            <div key={i.productId} className="flex justify-between text-sm">
              <span>{i.name} × {i.quantity}</span>
              <span>{formatKRW(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>합계</span><span>{formatKRW(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold">배송 정보</h2>
          <div><Label>받는 사람 *</Label><Input value={shipping.name} onChange={e => setShipping({...shipping, name: e.target.value})} /></div>
          <div><Label>연락처 * (010-1234-5678)</Label><Input value={shipping.phone} onChange={e => setShipping({...shipping, phone: e.target.value})} /></div>
          <div><Label>주소 *</Label><Input value={shipping.address} onChange={e => setShipping({...shipping, address: e.target.value})} /></div>
          <div><Label>배송 메모</Label><Textarea value={shipping.memo} onChange={e => setShipping({...shipping, memo: e.target.value})} /></div>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => router.push('/cart')}>장바구니로</Button>
        <Button onClick={submit} disabled={pending}>{pending ? '주문중...' : `${formatKRW(total)} 결제`}</Button>
      </div>
    </div>
  );
}
