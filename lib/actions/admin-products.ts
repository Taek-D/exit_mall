'use server';
import { createClient } from '@/lib/supabase/server';
import { productSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function parseForm(fd: FormData) {
  return productSchema.safeParse({
    name: fd.get('name'),
    description: fd.get('description') ?? '',
    price: Number(fd.get('price')),
    stock: Number(fd.get('stock')),
    isActive: fd.get('isActive') === 'on',
    imageUrl: (fd.get('imageUrl') as string) || null,
  });
}

export async function createProductAction(fd: FormData) {
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(' · ') };
  const supabase = createClient();
  const { error } = await (supabase.from('products') as any).insert({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function updateProductAction(id: string, fd: FormData) {
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(' · ') };
  const supabase = createClient();
  const { error } = await (supabase.from('products') as any).update({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function deleteProductAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  return { ok: true };
}
