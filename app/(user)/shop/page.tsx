import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/EmptyState';
import { FormError } from '@/components/FormError';
import { ProductCard } from '@/components/ProductCard';
import { PackageSearch } from 'lucide-react';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string | null;
  per_user_limit: number | null;
};

type PurchasedRow = {
  product_id: string | null;
  quantity: number;
  orders: { user_id: string; status: string } | null;
};

export default async function ShopPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [productsRes, purchasedRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, description, price, stock, image_url, per_user_limit')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    user
      ? supabase
          .from('order_items')
          .select('product_id, quantity, orders!inner(user_id, status)')
          .eq('orders.user_id', user.id)
          .neq('orders.status', 'cancelled')
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  const { data: products, error } = productsRes;
  const purchasedMap = new Map<string, number>();
  for (const r of (purchasedRes.data ?? []) as unknown as PurchasedRow[]) {
    if (!r.product_id) continue;
    purchasedMap.set(r.product_id, (purchasedMap.get(r.product_id) ?? 0) + Number(r.quantity ?? 0));
  }

  if (error) {
    return (
      <FormError className="rounded-lg p-6" iconClassName="h-5 w-5">
        <div>
          <p className="font-medium text-destructive">상품을 불러오지 못했습니다</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </FormError>
    );
  }

  const visible = (products ?? []) as ProductRow[];
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
        <EmptyState
          icon={PackageSearch}
          title="판매중인 상품이 없습니다"
          description="곧 새로운 상품이 등록될 예정입니다. 잠시 후 다시 확인해주세요."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={{ ...p, price: Number(p.price) }}
              alreadyBought={purchasedMap.get(p.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
