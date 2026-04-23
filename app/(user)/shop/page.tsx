import { createClient } from '@/lib/supabase/server';
import { ProductCard } from '@/components/ProductCard';
import { PackageSearch, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string | null;
};

export default async function ShopPage() {
  const supabase = createClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, stock, image_url')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border bg-destructive/5 p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-medium text-destructive">상품을 불러오지 못했습니다</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  const visible = ((products ?? []) as ProductRow[]).filter((p) => p.stock !== 0);
  const total = visible.length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">상품</h1>
          <p className="text-sm text-muted-foreground mt-1">승인된 회원 대상 폐쇄몰</p>
        </div>
        <span className="text-sm text-muted-foreground">
          <span className="font-mono tabular font-medium text-foreground">{total}</span>개 상품
        </span>
      </header>

      {total === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
            <PackageSearch className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="font-medium">판매중인 상품이 없습니다</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            곧 새로운 상품이 등록될 예정입니다. 잠시 후 다시 확인해주세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
          {visible.map((p) => (
            <ProductCard key={p.id} product={{ ...p, price: Number(p.price) }} />
          ))}
        </div>
      )}
    </div>
  );
}
