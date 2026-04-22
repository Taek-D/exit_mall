'use client';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';
import { useCart } from '@/components/CartProvider';
import { useToast } from '@/hooks/use-toast';

type Product = { id: string; name: string; description: string; price: number; stock: number; image_url: string | null };

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();
  const soldOut = product.stock === 0;

  function onAdd() {
    add({ productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.image_url });
    toast({ title: '장바구니 담김', description: product.name });
  }

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square relative bg-muted">
        {product.image_url
          ? <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="300px" />
          : <div className="flex items-center justify-center h-full text-muted-foreground text-sm">이미지 없음</div>}
      </div>
      <CardContent className="p-4 space-y-1">
        <h3 className="font-semibold">{product.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
        <p className="font-bold">{formatKRW(product.price)}</p>
        {product.stock >= 0 && <p className="text-xs text-muted-foreground">재고 {product.stock}개</p>}
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" disabled={soldOut} onClick={onAdd}>
          {soldOut ? '품절' : '장바구니 담기'}
        </Button>
      </CardFooter>
    </Card>
  );
}
