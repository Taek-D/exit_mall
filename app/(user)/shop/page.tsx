import { createClient } from '@/lib/supabase/server';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string; name: string; description: string; price: number; stock: number; image_url: string | null;
};

export default async function ShopPage() {
  const supabase = createClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, stock, image_url')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return <p className="text-destructive">상품 불러오기 실패: {error.message}</p>;

  const visible = ((products ?? []) as ProductRow[]).filter(p => p.stock !== 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">상품</h1>
      {visible.length === 0 ? (
        <p className="text-muted-foreground">판매중인 상품이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map(p => <ProductCard key={p.id} product={{ ...p, price: Number(p.price) }} />)}
        </div>
      )}
    </div>
  );
}
