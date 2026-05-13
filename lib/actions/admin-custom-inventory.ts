'use server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapCustomInventoryError } from '@/lib/errors/custom-inventory';

const addSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1, '상품명을 입력해주세요.').max(100, '상품명은 100자 이내여야 합니다.'),
  quantity: z.number().int().min(0, '수량은 0 이상이어야 합니다.'),
  memo: z.string().max(200).optional(),
});

const adjustSchema = z.object({
  userId: z.string().uuid(),
  customInventoryId: z.string().uuid(),
  delta: z.number().int().refine((v) => v !== 0, '0이 아닌 정수여야 합니다.'),
  memo: z.string().max(200).optional(),
});

const deleteSchema = z.object({
  userId: z.string().uuid(),
  customInventoryId: z.string().uuid(),
});

function revalidateUser(userId: string) {
  revalidatePaths([`/admin/users/${userId}`, '/inventory']);
}

export async function addCustomInventoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await callRpc(guard.supabase, 'add_user_custom_inventory', {
    target_user: parsed.data.userId,
    name: parsed.data.name,
    initial_qty: parsed.data.quantity,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    console.error('[admin-custom-inventory] add', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true, id: data as string };
}

export async function adjustCustomInventoryAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'adjust_user_custom_inventory', {
    target_user: parsed.data.userId,
    custom_id: parsed.data.customInventoryId,
    delta: parsed.data.delta,
    memo: parsed.data.memo ?? null,
  });
  if (error) {
    console.error('[admin-custom-inventory] adjust', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true };
}

export async function deleteCustomInventoryAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'delete_user_custom_inventory', {
    target_user: parsed.data.userId,
    custom_id: parsed.data.customInventoryId,
  });
  if (error) {
    console.error('[admin-custom-inventory] delete', error);
    return { ok: false, error: mapCustomInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true };
}
