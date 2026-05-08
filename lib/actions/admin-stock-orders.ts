'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';
import { mapStockOrderError } from '@/lib/actions/stock-order';

export async function approveStockOrderAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('approve_stock_order', { order_id: orderId });
  if (error) {
    console.error('[admin-stock-orders] approve', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function rejectStockOrderAction(
  orderId: string,
  memo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('reject_stock_order', {
    order_id: orderId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-stock-orders] reject', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/admin/orders');
  revalidatePath('/orders');
  return { ok: true };
}
