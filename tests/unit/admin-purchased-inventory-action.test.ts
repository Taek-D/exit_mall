import { describe, expect, it } from 'vitest';
import {
  parseAddPurchasedInventoryInput,
  parseUpdatePurchasedInventoryInput,
} from '@/lib/actions/admin-purchased-inventory';

const userId = '11111111-1111-4111-8111-111111111111';
const lotId = '22222222-2222-4222-8222-222222222222';

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
});
