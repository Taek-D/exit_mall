import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRpc: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePaths: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/actions/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/actions/_shared')>();
  return {
    ...actual,
    callRpc: mocks.callRpc,
    revalidatePaths: mocks.revalidatePaths,
  };
});

import {
  addPurchasedInventoryLotAction,
  parseAddPurchasedInventoryInput,
  parseUpdatePurchasedInventoryInput,
  updatePurchasedInventoryLotAction,
} from '@/lib/actions/admin-purchased-inventory';

const userId = '11111111-1111-4111-8111-111111111111';
const lotId = '22222222-2222-4222-8222-222222222222';
const supabase = { rpc: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    ok: true,
    supabase,
    user: { id: 'admin-1' },
    profile: { role: 'admin', status: 'active' },
  });
});

describe('admin purchased inventory action input parsing', () => {
  it('trims add input and defaults optional strings', () => {
    const parsed = parseAddPurchasedInventoryInput({
      userId,
      productName: '  테스트 상품  ',
      quantity: 3,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      userId,
      productName: '테스트 상품',
      optionName: '',
      quantity: 3,
      memo: '',
    });
  });

  it('trims update input and accepts remainingQuantity 0', () => {
    const parsed = parseUpdatePurchasedInventoryInput({
      userId,
      lotId,
      productName: '  테스트 상품  ',
      optionName: '  검정 / XL  ',
      remainingQuantity: 0,
      memo: '  재고 소진  ',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      userId,
      lotId,
      productName: '테스트 상품',
      optionName: '검정 / XL',
      remainingQuantity: 0,
      memo: '재고 소진',
    });
  });

  it('rejects add quantity 0', () => {
    const parsed = parseAddPurchasedInventoryInput({
      userId,
      productName: '테스트 상품',
      quantity: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it('normalizes blank add optionName and memo to null in RPC payload', async () => {
    mocks.callRpc.mockResolvedValue({ data: lotId, error: null });

    const result = await addPurchasedInventoryLotAction({
      userId,
      productName: '테스트 상품',
      optionName: '   ',
      quantity: 2,
      memo: '',
    });

    expect(result).toEqual({ ok: true, id: lotId });
    expect(mocks.callRpc).toHaveBeenCalledWith(supabase, 'admin_add_purchased_inventory_lot', {
      target_user: userId,
      product_name: '테스트 상품',
      option_name: null,
      quantity: 2,
      memo: null,
    });
  });

  it('normalizes blank update optionName and memo to null in RPC payload', async () => {
    mocks.callRpc.mockResolvedValue({ data: null, error: null });

    const result = await updatePurchasedInventoryLotAction({
      userId,
      lotId,
      productName: '테스트 상품',
      optionName: '',
      remainingQuantity: 0,
      memo: '   ',
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.callRpc).toHaveBeenCalledWith(supabase, 'admin_update_purchased_inventory_lot', {
      target_user: userId,
      lot_id: lotId,
      product_name: '테스트 상품',
      option_name: null,
      remaining_quantity: 0,
      memo: null,
    });
  });
});
