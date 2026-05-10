'use server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { mapStockOrderError } from '@/lib/errors/stock-order';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';

const requestStockOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .min(1, '장바구니가 비어있습니다.'),
});

export type StockOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export async function requestStockOrderAction(input: unknown): Promise<StockOrderResult> {
  const parsed = requestStockOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'request_stock_order', {
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
  revalidatePaths(['/orders', '/shop', '/deposit']);
  return { ok: true, orderId: data as string };
}

export async function cancelStockOrderAction(
  orderId: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_stock_order', { order_id: orderId });
  if (error) {
    console.error('[stock-order] cancel', { orderId, error });
    return { ok: false, error: mapStockOrderError(error.message) };
  }
  revalidatePaths(['/orders', '/deposit']);
  return { ok: true };
}
