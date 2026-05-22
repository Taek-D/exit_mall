'use server';

import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import {
  parseAddPurchasedInventoryInput,
  parseUpdatePurchasedInventoryInput,
} from '@/lib/admin/purchased-inventory-input';
import { mapPurchasedInventoryError } from '@/lib/errors/purchased-inventory';

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
