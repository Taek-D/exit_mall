import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/EmptyState';
import { ProductThumbnail } from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { DeleteProductButton } from './DeleteProductButton';
import { RestoreProductButton } from './RestoreProductButton';
import { StatusPill } from '@/components/StatusBadge';
import { Plus, Package, Upload } from 'lucide-react';

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
        <EmptyState
          icon={Package}
          description={emptyText}
          iconClassName="h-5 w-5"
          action={
            !showDeleted && (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/products/new">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  상품 추가
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
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
                {list.map((product) => (
                  <ProductRow key={product.id} product={product} showDeleted={showDeleted} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRow({ product, showDeleted }: { product: Product; showDeleted: boolean }) {
  return (
    <tr className="border-t h-14 hover:bg-surface-muted/50 transition-colors">
      <td className="px-4">
        <ProductThumbnail src={product.image_url} alt="" sizes="40px" className="h-10 w-10" />
      </td>
      <td className="px-3">
        <ProductName product={product} showDeleted={showDeleted} />
      </td>
      <td className="px-3 text-right font-mono tabular">
        {formatKRW(Number(product.price))}
      </td>
      <td className="px-3 text-right font-mono tabular">
        <ProductStock stock={product.stock} />
      </td>
      <td className="px-3">
        <ProductStatus product={product} showDeleted={showDeleted} />
      </td>
      <td className="px-3 text-right">
        <ProductActions product={product} showDeleted={showDeleted} />
      </td>
    </tr>
  );
}

function ProductName({ product, showDeleted }: { product: Product; showDeleted: boolean }) {
  return (
    <>
      {showDeleted ? (
        <span className="font-medium">{product.name}</span>
      ) : (
        <Link href={`/admin/products/${product.id}`} className="font-medium hover:underline">
          {product.name}
        </Link>
      )}
      {showDeleted && product.deleted_at && (
        <p className="text-xs text-muted-foreground mt-1">
          삭제: {new Date(product.deleted_at).toLocaleDateString('ko-KR')}
        </p>
      )}
    </>
  );
}

function ProductStock({ stock }: { stock: number }) {
  const outStock = stock === 0;
  const lowStock = stock > 0 && stock < 10;

  if (stock === -1) {
    return <span className="text-muted-foreground">무제한</span>;
  }

  return (
    <span
      className={
        outStock ? 'text-destructive font-medium' : lowStock ? 'text-warning font-medium' : ''
      }
    >
      {stock}
    </span>
  );
}

function ProductStatus({ product, showDeleted }: { product: Product; showDeleted: boolean }) {
  if (showDeleted) return <StatusPill tone="neutral">삭제됨</StatusPill>;
  if (product.is_active) return <StatusPill tone="success">판매중</StatusPill>;
  return <StatusPill tone="neutral">중지</StatusPill>;
}

function ProductActions({ product, showDeleted }: { product: Product; showDeleted: boolean }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {showDeleted ? (
        <RestoreProductButton id={product.id} name={product.name} />
      ) : (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/products/${product.id}`}>수정</Link>
          </Button>
          <DeleteProductButton id={product.id} name={product.name} />
        </>
      )}
    </div>
  );
}
