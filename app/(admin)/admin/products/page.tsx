import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { formatKRW } from '@/lib/money';
import { DeleteProductButton } from './DeleteProductButton';
import { StatusPill } from '@/components/StatusBadge';
import { Plus, ImageOff, Package } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

export default async function ProductsPage() {
  const supabase = createClient();
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  const list = (products ?? []) as unknown as Product[];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <p className="text-sm text-muted-foreground">
          전체 <span className="font-mono tabular font-medium text-foreground">{list.length}</span>개
          상품
        </p>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="h-4 w-4" aria-hidden />새 상품
          </Link>
        </Button>
      </header>

      {list.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">상품이 없습니다. 첫 상품을 등록해주세요.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/products/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              상품 추가
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10 w-16"></th>
                  <th className="font-medium px-3">상품명</th>
                  <th className="font-medium px-3 text-right">가격</th>
                  <th className="font-medium px-3 text-right">재고</th>
                  <th className="font-medium px-3">상태</th>
                  <th className="font-medium px-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const outStock = p.stock === 0;
                  const lowStock = p.stock > 0 && p.stock < 10;
                  return (
                    <tr key={p.id} className="border-t h-14 hover:bg-surface-muted/50 transition-colors">
                      <td className="px-4">
                        <div className="relative h-10 w-10 rounded-md bg-surface-muted overflow-hidden">
                          {p.image_url ? (
                            <Image
                              src={p.image_url}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                              <ImageOff className="h-4 w-4" aria-hidden />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3">
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 text-right font-mono tabular">
                        {formatKRW(Number(p.price))}
                      </td>
                      <td className="px-3 text-right font-mono tabular">
                        {p.stock === -1 ? (
                          <span className="text-muted-foreground">무제한</span>
                        ) : (
                          <span
                            className={
                              outStock
                                ? 'text-destructive font-medium'
                                : lowStock
                                  ? 'text-warning font-medium'
                                  : ''
                            }
                          >
                            {p.stock}
                          </span>
                        )}
                      </td>
                      <td className="px-3">
                        {p.is_active ? (
                          <StatusPill tone="success">판매중</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">중지</StatusPill>
                        )}
                      </td>
                      <td className="px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/products/${p.id}`}>수정</Link>
                          </Button>
                          <DeleteProductButton id={p.id} name={p.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
