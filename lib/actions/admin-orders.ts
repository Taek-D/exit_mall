'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markPreparingAction(orderId: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('transition_order_status', { order_id: orderId, next_status: 'preparing' });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders'); revalidatePath('/admin');
  return { ok: true };
}

export async function markShippedAction(orderId: string, tracking: string, carrier: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('transition_order_status', {
    order_id: orderId, next_status: 'shipped', tracking, carrier_name: carrier,
  });
  if (error) {
    if (error.message.includes('TRACKING_REQUIRED')) return { error: '송장번호와 택배사 필수' };
    return { error: error.message };
  }
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}

export async function markDeliveredAction(orderId: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('transition_order_status', { order_id: orderId, next_status: 'delivered' });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}

export async function adminCancelOrderAction(orderId: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_order', { order_id: orderId });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}
