import { createProductAction } from '@/lib/actions/admin-products';
import { ProductForm } from '../ProductForm';

export default function NewProductPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">새 상품</h1>
      <ProductForm action={createProductAction} />
    </div>
  );
}
