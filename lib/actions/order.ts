'use server';
import { createClient } from '@/lib/supabase/server';
import { checkoutSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join(' · ');
    return { ok: false, error: msg };
  }

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
    if (msg.includes('PER_USER_LIMIT_EXCEEDED')) {
      const parts = msg.split(':');
      const productId = parts[1]?.trim();
      const limit = parts[2]?.trim();
      const already = parts[3]?.trim();
      return {
        ok: false,
        error: `1인 구매 한도를 초과했습니다 (한도 ${limit}개, 누적 ${already}개)`,
        productId,
      };
    }
    if (msg.includes('NOT_ACTIVE')) return { ok: false, error: '계정이 활성 상태가 아닙니다' };
    console.error('[order] place', error);
    return { ok: false, error: '주문을 처리하지 못했습니다.' };
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
    console.error('[order] cancel', { orderId, error });
    return { ok: false, error: '주문을 취소하지 못했습니다.' };
  }
  revalidatePath('/orders');
  return { ok: true };
}
