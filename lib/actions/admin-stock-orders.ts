'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapStockOrderError } from '@/lib/errors/stock-order';

export async function approveStockOrderAction(
  orderId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'approve_stock_order', { order_id: orderId });
  if (error) {
    console.error('[admin-stock-orders] approve', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePaths(['/admin/orders', '/orders', '/inventory']);
  return { ok: true };
}

export async function rejectStockOrderAction(
  orderId: string,
  memo: string,
): Promise<ActionResult> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'reject_stock_order', {
    order_id: orderId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-stock-orders] reject', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePaths(['/admin/orders', '/orders']);
  return { ok: true };
}
