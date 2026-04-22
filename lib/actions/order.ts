'use server';
import { createClient } from '@/lib/supabase/server';
import { checkoutSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data, error } = await (supabase.rpc as any)('place_order', {
    items: parsed.data.items.map(i => ({ product_id: i.productId, quantity: i.quantity })),
    shipping: {
      name: parsed.data.shipping.name,
      phone: parsed.data.shipping.phone,
      address: parsed.data.shipping.address,
      memo: parsed.data.shipping.memo ?? '',
    },
  });

  if (error) {
    const msg = error.message;
    if (msg.includes('INSUFFICIENT_BALANCE')) return { ok: false, error: '예치금이 부족합니다' };
    if (msg.includes('OUT_OF_STOCK')) {
      const productId = msg.split(':')[1]?.trim();
      return { ok: false, error: '재고가 부족합니다', productId };
    }
    if (msg.includes('PRODUCT_INACTIVE')) {
      const productId = msg.split(':')[1]?.trim();
      return { ok: false, error: '판매 중지된 상품이 있습니다', productId };
    }
    if (msg.includes('NOT_ACTIVE')) return { ok: false, error: '계정이 활성 상태가 아닙니다' };
    return { ok: false, error: msg };
  }

  revalidatePath('/orders');
  revalidatePath('/shop');
  return { ok: true, orderId: data as string };
}

export async function cancelOrderAction(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_order', { order_id: orderId });
  if (error) {
    if (error.message.includes('NOT_CANCELLABLE')) return { ok: false, error: '이미 처리되어 취소할 수 없습니다' };
    return { ok: false, error: error.message };
  }
  revalidatePath('/orders');
  return { ok: true };
}
