'use server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';

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
    if (error.message.startsWith('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.startsWith('ZERO_DELTA'))
      return { ok: false, error: '0이 아닌 값을 입력해주세요.' };
    if (error.message.startsWith('NEGATIVE_INVENTORY')) {
      const parts = error.message.split(':');
      return {
        ok: false,
        error: `잔여 재고가 부족합니다 (현재 ${parts[1]}, 적용하려는 변화 ${parts[2]}).`,
      };
    }
    console.error('[admin-inventory] adjust', error);
    return { ok: false, error: '처리 중 오류가 발생했습니다.' };
  }
  revalidatePaths([`/admin/users/${parsed.data.userId}`, '/inventory']);
  return { ok: true };
}
