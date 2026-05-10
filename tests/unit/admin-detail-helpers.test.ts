import { describe, expect, it } from 'vitest';
import {
  calculateTotalSpent,
  getInventoryProductName,
  isPositiveTransaction,
} from '@/lib/admin/user-detail';
import { hasInsufficientBalance } from '@/lib/admin/order-details';

describe('admin detail helpers', () => {
  it('excludes cancelled orders from total spent', () => {
    expect(
      calculateTotalSpent([
        { id: '1', total_amount: 1000, status: 'placed', created_at: '2026-01-01' },
        { id: '2', total_amount: 5000, status: 'cancelled', created_at: '2026-01-02' },
        { id: '3', total_amount: 2500, status: 'delivered', created_at: '2026-01-03' },
      ]),
    ).toBe(3500);
  });

  it('maps inventory names with a fallback', () => {
    expect(
      getInventoryProductName({
        product_id: 'p1',
        quantity: 2,
        products: { name: '상품 A' },
      }),
    ).toBe('상품 A');
    expect(getInventoryProductName({ product_id: 'p2', quantity: 0, products: null })).toBe(
      '(이름 없음)',
    );
  });

  it('detects transaction direction and insufficient pending balances', () => {
    expect(isPositiveTransaction({ amount: 0 })).toBe(true);
    expect(isPositiveTransaction({ amount: -1 })).toBe(false);
    expect(hasInsufficientBalance('pending', 1000, 1001)).toBe(true);
    expect(hasInsufficientBalance('approved', 1000, 1001)).toBe(false);
  });
});
