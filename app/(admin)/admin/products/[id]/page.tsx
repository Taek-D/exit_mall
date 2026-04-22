import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '../ProductForm';
import { updateProductAction } from '@/lib/actions/admin-products';
import { notFound } from 'next/navigation';

type Product = { name: string; description: string; price: number; stock: number; is_active: boolean; image_url: string | null };

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: p } = await supabase.from('products').select('*').eq('id', params.id).single<Product>();
  if (!p) notFound();

  const bound = updateProductAction.bind(null, params.id);

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">상품 수정</h1>
      <ProductForm action={bound as any} defaults={{
        name: p.name, description: p.description, price: Number(p.price), stock: p.stock,
        is_active: p.is_active, image_url: p.image_url,
      }} />
    </div>
  );
}
