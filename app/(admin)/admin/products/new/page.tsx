import { createProductAction } from '@/lib/actions/admin-products';
import { ProductForm } from '../ProductForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NewProductPage() {
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
        <p className="text-sm text-muted-foreground">
          새 상품을 등록합니다. 승인 후 상점에 즉시 노출됩니다.
        </p>
      </header>
      <ProductForm action={createProductAction} />
    </div>
  );
}
