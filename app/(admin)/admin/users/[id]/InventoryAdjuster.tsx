'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { adjustUserInventoryAction } from '@/lib/actions/admin-inventory';

type Product = { id: string; name: string };

export function InventoryAdjuster({
  userId,
  products,
}: {
  userId: string;
  products: Product[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [delta, setDelta] = useState<number>(0);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">보유 재고 수동 조정</h3>
      <div className="grid grid-cols-3 gap-3">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input
          type="number"
          placeholder="변화 (음수 가능)"
          value={Number.isFinite(delta) ? delta : 0}
          onChange={(e) => setDelta(parseInt(e.target.value, 10) || 0)}
        />
        <Input
          placeholder="메모 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        disabled={pending || !productId || delta === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await adjustUserInventoryAction({ userId, productId, delta, memo });
            if (!r.ok) {
              setError(r.error ?? '실패');
              return;
            }
            toast({ title: '조정 완료' });
            setDelta(0);
            setMemo('');
            router.refresh();
          })
        }
      >
        {pending ? '처리 중…' : '조정'}
      </Button>
    </div>
  );
}
