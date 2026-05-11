'use server';
import { productSchema } from '@/lib/schemas';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/actions/_guards';
import { formatZodPathError, mutationTable, revalidatePaths } from '@/lib/actions/_shared';

function parseForm(fd: FormData) {
  const rawLimit = (fd.get('perUserLimit') as string | null)?.trim() ?? '';
  const optionalText = (key: string) => {
    const value = (fd.get(key) as string | null)?.trim() ?? '';
    return value.length > 0 ? value : null;
  };
  return productSchema.safeParse({
    name: fd.get('name'),
    description: fd.get('description') ?? '',
    price: Number(fd.get('price')),
    stock: Number(fd.get('stock')),
    isActive: fd.get('isActive') === 'on',
    imageUrl: (fd.get('imageUrl') as string) || null,
    brand: optionalText('brand'),
    optionName: optionalText('optionName'),
    managementCode: optionalText('managementCode'),
    category: optionalText('category'),
    barcode: optionalText('barcode'),
    perUserLimit: rawLimit === '' ? null : Number(rawLimit),
  });
}

export async function createProductAction(fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: formatZodPathError(parsed.error) };
  const { error } = await mutationTable(guard.supabase, 'products').insert({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
    brand: parsed.data.brand, option_name: parsed.data.optionName,
    management_code: parsed.data.managementCode, category: parsed.data.category,
    barcode: parsed.data.barcode,
    per_user_limit: parsed.data.perUserLimit,
  });
  if (error) {
    console.error('[admin-products] create', error);
    return { error: '상품을 등록하지 못했습니다.' };
  }
  revalidatePaths(['/admin/products']);
  redirect('/admin/products');
}

export async function updateProductAction(id: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: formatZodPathError(parsed.error) };
  const { error } = await mutationTable(guard.supabase, 'products').update({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
    brand: parsed.data.brand, option_name: parsed.data.optionName,
    management_code: parsed.data.managementCode, category: parsed.data.category,
    barcode: parsed.data.barcode,
    per_user_limit: parsed.data.perUserLimit,
  }).eq('id', id);
  if (error) {
    console.error('[admin-products] update', { id, error });
    return { error: '상품을 수정하지 못했습니다.' };
  }
  revalidatePaths(['/admin/products']);
  redirect('/admin/products');
}

export async function deleteProductAction(id: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.from('products').delete().eq('id', id);
  if (error) {
    console.error('[admin-products] delete', { id, error });
    return { error: '상품을 삭제하지 못했습니다.' };
  }
  revalidatePaths(['/admin/products']);
  return { ok: true };
}
