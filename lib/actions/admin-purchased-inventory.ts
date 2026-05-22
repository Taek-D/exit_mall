'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapPurchasedInventoryError } from '@/lib/errors/purchased-inventory';

const optionalTrimmedString = (max: number, message: string) =>
  z.string().trim().max(max, message).default('');

const addPurchasedInventorySchema = z.object({
  userId: z.string().uuid('올바른 사용자 ID가 아닙니다.'),
  productName: z
    .string()
    .trim()
    .min(1, '상품명을 입력해 주세요.')
    .max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: optionalTrimmedString(100, '옵션명은 100자 이하여야 합니다.'),
  quantity: z.number().int('수량은 정수여야 합니다.').min(1, '수량은 1 이상이어야 합니다.'),
  memo: optionalTrimmedString(200, '메모는 200자 이하여야 합니다.'),
});

const updatePurchasedInventorySchema = z.object({
  userId: z.string().uuid('올바른 사용자 ID가 아닙니다.'),
  lotId: z.string().uuid('올바른 사입재고 ID가 아닙니다.'),
  productName: z
    .string()
    .trim()
    .min(1, '상품명을 입력해 주세요.')
    .max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: optionalTrimmedString(100, '옵션명은 100자 이하여야 합니다.'),
  remainingQuantity: z
    .number()
    .int('남은 수량은 정수여야 합니다.')
    .min(0, '남은 수량은 0 이상이어야 합니다.'),
  memo: optionalTrimmedString(200, '메모는 200자 이하여야 합니다.'),
});

export function parseAddPurchasedInventoryInput(input: unknown) {
  return addPurchasedInventorySchema.safeParse(input);
}

export function parseUpdatePurchasedInventoryInput(input: unknown) {
  return updatePurchasedInventorySchema.safeParse(input);
}

function revalidatePurchasedInventory(userId: string) {
  revalidatePaths([`/admin/users/${userId}`, '/shipping-uploads/purchased']);
}

function blankToNull(value: string) {
  return value === '' ? null : value;
}

export async function addPurchasedInventoryLotAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseAddPurchasedInventoryInput(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await callRpc(guard.supabase, 'admin_add_purchased_inventory_lot', {
    target_user: parsed.data.userId,
    product_name: parsed.data.productName,
    option_name: blankToNull(parsed.data.optionName),
    quantity: parsed.data.quantity,
    memo: blankToNull(parsed.data.memo),
  });
  if (error) {
    console.error('[admin-purchased-inventory] add', error);
    return { ok: false, error: mapPurchasedInventoryError(error.message) };
  }

  revalidatePurchasedInventory(parsed.data.userId);
  return { ok: true, id: data as string };
}

export async function updatePurchasedInventoryLotAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = parseUpdatePurchasedInventoryInput(input);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'admin_update_purchased_inventory_lot', {
    target_user: parsed.data.userId,
    lot_id: parsed.data.lotId,
    product_name: parsed.data.productName,
    option_name: blankToNull(parsed.data.optionName),
    remaining_quantity: parsed.data.remainingQuantity,
    memo: blankToNull(parsed.data.memo),
  });
  if (error) {
    console.error('[admin-purchased-inventory] update', error);
    return { ok: false, error: mapPurchasedInventoryError(error.message) };
  }

  revalidatePurchasedInventory(parsed.data.userId);
  return { ok: true };
}
