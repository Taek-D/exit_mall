'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, revalidatePaths } from '@/lib/actions/_shared';

export async function markPreparingAction(orderId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await callRpc(guard.supabase, 'transition_order_status', { order_id: orderId, next_status: 'preparing' });
  if (error) {
    console.error('[admin-orders] preparing', { orderId, error });
    return { error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths([`/admin/orders/${orderId}`, '/admin/orders', '/admin']);
  return { ok: true };
}

export async function markShippedAction(orderId: string, tracking: string, carrier: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await callRpc(guard.supabase, 'transition_order_status', {
    order_id: orderId, next_status: 'shipped', tracking, carrier_name: carrier,
  });
  if (error) {
    if (error.message.includes('TRACKING_REQUIRED')) return { error: '송장번호와 택배사 필수' };
    console.error('[admin-orders] shipped', { orderId, error });
    return { error: '발송 처리에 실패했습니다.' };
  }
  revalidatePaths([`/admin/orders/${orderId}`, '/admin/orders']);
  return { ok: true };
}

export async function markDeliveredAction(orderId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await callRpc(guard.supabase, 'transition_order_status', { order_id: orderId, next_status: 'delivered' });
  if (error) {
    console.error('[admin-orders] delivered', { orderId, error });
    return { error: '배송 완료 처리에 실패했습니다.' };
  }
  revalidatePaths([`/admin/orders/${orderId}`, '/admin/orders']);
  return { ok: true };
}

export async function adminCancelOrderAction(orderId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await callRpc(guard.supabase, 'cancel_order', { order_id: orderId });
  if (error) {
    console.error('[admin-orders] cancel', { orderId, error });
    return { error: '주문을 취소하지 못했습니다.' };
  }
  revalidatePaths([`/admin/orders/${orderId}`, '/admin/orders']);
  return { ok: true };
}
