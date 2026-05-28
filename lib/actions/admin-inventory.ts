'use server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapInventoryAdjustError } from '@/lib/errors/inventory';

const adjustSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  delta: z.number().int().refine((v) => v !== 0, '0이 아닌 정수여야 합니다.'),
  memo: z.string().max(200).optional(),
});

export async function adjustUserInventoryAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'adjust_user_inventory', {
    target_user: parsed.data.userId,
    product_id: parsed.data.productId,
    delta: parsed.data.delta,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    const mapped = mapInventoryAdjustError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[admin-inventory] adjust', error);
    return { ok: false, error: '처리 중 오류가 발생했습니다.' };
  }
  revalidatePaths([`/admin/users/${parsed.data.userId}`, '/inventory']);
  return { ok: true };
}
