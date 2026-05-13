import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { formatKRW } from '@/lib/money';
import { DeleteProductButton } from './DeleteProductButton';
import { RestoreProductButton } from './RestoreProductButton';
import { StatusPill } from '@/components/StatusBadge';
import { Plus, ImageOff, Package, Upload } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  deleted_at: string | null;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: { view?: string | string[] };
}) {
  const supabase = createClient();
  const view = Array.isArray(searchParams?.view) ? searchParams?.view[0] : searchParams?.view;
  const showDeleted = view === 'deleted';

  let query = supabase.from('products').select('*');
  query = showDeleted
    ? query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    : query.is('deleted_at', null).order('created_at', { ascending: false });

  const { data: products } = await query;
  const list = (products ?? []) as unknown as Product[];
  const emptyText = showDeleted
    ? '삭제된 상품이 없습니다.'
    : '상품이 없습니다. 첫 상품을 등록해주세요.';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 pb-4 border-b lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border bg-background p-1">
            <Button asChild size="sm" variant={!showDeleted ? 'default' : 'ghost'}>
              <Link href="/admin/products">상품</Link>
            </Button>
            <Button asChild size="sm" variant={showDeleted ? 'default' : 'ghost'}>
              <Link href="/admin/products?view=deleted">삭제됨</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {showDeleted ? '삭제됨' : '전체'}{' '}
            <span className="font-mono tabular font-medium text-foreground">{list.length}</span>개
            상품
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/products/import">
              <Upload className="h-4 w-4" aria-hidden />
              엑셀 가져오기
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" aria-hidden />새 상품
            </Link>
          </Button>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Package className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          {!showDeleted && (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/products/new">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                상품 추가
              </Link>
            </Button>
          )}
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
                        {showDeleted ? (
                          <span className="font-medium">{p.name}</span>
                        ) : (
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="font-medium hover:underline"
                          >
                            {p.name}
                          </Link>
                        )}
                        {showDeleted && p.deleted_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            삭제: {new Date(p.deleted_at).toLocaleDateString('ko-KR')}
                          </p>
                        )}
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
                        {showDeleted ? (
                          <StatusPill tone="neutral">삭제됨</StatusPill>
                        ) : p.is_active ? (
                          <StatusPill tone="success">판매중</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">중지</StatusPill>
                        )}
                      </td>
                      <td className="px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {showDeleted ? (
                            <RestoreProductButton id={p.id} name={p.name} />
                          ) : (
                            <>
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/products/${p.id}`}>수정</Link>
                              </Button>
                              <DeleteProductButton id={p.id} name={p.name} />
                            </>
                          )}
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
