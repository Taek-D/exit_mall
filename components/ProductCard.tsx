'use client';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { useCart } from '@/components/CartProvider';
import { useToast } from '@/hooks/use-toast';
import { ImageOff, ShoppingBag, Check } from 'lucide-react';
import { StatusPill } from '@/components/StatusBadge';
import { useState } from 'react';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string | null;
};

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = product.stock === 0;
  const low = product.stock > 0 && product.stock < 10;

  function onAdd() {
    add({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.image_url,
    });
    toast({ title: '장바구니에 담겼습니다', description: product.name });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors duration-150 ease-out-expo hover:border-foreground/30">
      <div className="aspect-square relative bg-surface-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageOff className="h-8 w-8" aria-hidden />
          </div>
        )}
        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-background/75 backdrop-blur-sm">
            <StatusPill tone="neutral">품절</StatusPill>
          </div>
        )}
        {low && !soldOut && (
          <div className="absolute top-2 left-2">
            <StatusPill tone="warning">재고 {product.stock}</StatusPill>
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 p-4 gap-1.5">
        <h3 className="font-medium text-[15px] leading-tight line-clamp-1">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
        )}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <span className="font-mono tabular font-semibold text-[15px]">
            {formatKRW(product.price)}
          </span>
        </div>
      </div>
      <div className="p-3 pt-0">
        <Button
          className="w-full"
          variant={justAdded ? 'secondary' : 'default'}
          disabled={soldOut}
          onClick={onAdd}
          aria-label={`${product.name} 장바구니 담기`}
        >
          {soldOut ? (
            '품절'
          ) : justAdded ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              담김
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              담기
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
