'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const requestStockOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .min(1, '장바구니가 비어있습니다.'),
});

export type StockOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export function mapStockOrderError(message: string): string {
  if (message.startsWith('UNAUTHORIZED')) return '로그인이 필요합니다.';
  if (message.startsWith('NOT_ACTIVE')) return '계정이 활성 상태가 아닙니다.';
  if (message.startsWith('EMPTY_CART')) return '장바구니가 비어있습니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량 값이 올바르지 않습니다.';
  if (message.startsWith('INSUFFICIENT_BALANCE')) return '가용 예치금이 부족합니다.';
  if (message.startsWith('OUT_OF_STOCK')) return '재고가 부족한 상품이 있습니다.';
  if (message.startsWith('PRODUCT_INACTIVE')) return '판매 중지된 상품이 있습니다.';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return '존재하지 않는 상품이 포함되어 있습니다.';
  if (message.startsWith('PER_USER_LIMIT_EXCEEDED')) {
    const parts = message.split(':');
    const limit = parts[2] ?? '?';
    const already = parts[3] ?? '?';
    return `1인 구매 한도를 초과했습니다 (한도 ${limit}개, 누적 ${already}개).`;
  }
  if (message.startsWith('FORBIDDEN')) return '권한이 없습니다.';
  if (message.startsWith('NOT_FOUND')) return '찾을 수 없습니다.';
  if (message.startsWith('ALREADY_PROCESSED')) return '이미 처리되었습니다.';
  if (message.startsWith('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('USER_NOT_ACTIVE')) return '사용자 계정이 활성 상태가 아닙니다.';
  return '처리 중 오류가 발생했습니다.';
}

export async function requestStockOrderAction(input: unknown): Promise<StockOrderResult> {
  const parsed = requestStockOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(' · ') };
  }
  const supabase = createClient();
  const { data, error } = await (supabase.rpc as any)('request_stock_order', {
    items: parsed.data.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) {
    const msg = error.message;
    const productId =
      msg.startsWith('OUT_OF_STOCK') || msg.startsWith('PRODUCT_INACTIVE')
        ? msg.split(':')[1]?.trim()
        : undefined;
    console.error('[stock-order] request', error);
    return { ok: false, error: mapStockOrderError(msg), productId };
  }
  revalidatePath('/orders');
  revalidatePath('/shop');
  revalidatePath('/deposit');
  return { ok: true, orderId: data as string };
}

export async function cancelStockOrderAction(
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_stock_order', { order_id: orderId });
  if (error) {
    console.error('[stock-order] cancel', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePath('/orders');
  revalidatePath('/deposit');
  return { ok: true };
}
