import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '../ProductForm';
import { updateProductAction } from '@/lib/actions/admin-products';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type Product = {
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: boolean;
  image_url: string | null;
};

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: p } = await supabase
    .from('products')
    .select('*')
    .eq('id', params.id)
    .single<Product>();
  if (!p) notFound();

  const bound = updateProductAction.bind(null, params.id);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        상품 목록
      </Link>
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">{p.name}</h1>
      </header>
      <ProductForm
        action={bound as (fd: FormData) => Promise<{ error?: string } | void>}
        defaults={{
          name: p.name,
          description: p.description,
          price: Number(p.price),
          stock: p.stock,
          is_active: p.is_active,
          image_url: p.image_url,
        }}
      />
    </div>
  );
}
