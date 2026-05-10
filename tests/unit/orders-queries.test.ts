import { describe, expect, it } from 'vitest';
import { summarizeStockItems } from '@/lib/orders/queries';

describe('orders query helpers', () => {
  it('summarizes empty stock orders', () => {
    expect(summarizeStockItems([])).toBe('(빈 주문)');
  });

  it('summarizes a single stock item', () => {
    expect(
      summarizeStockItems([
        { product_id: 'p1', product_name: '테스트 상품', qty: 2, subtotal: 1000 },
      ]),
    ).toBe('테스트 상품 × 2');
  });

  it('summarizes multiple stock items', () => {
    expect(
      summarizeStockItems([
        { product_id: 'p1', product_name: '첫 상품', qty: 1, subtotal: 1000 },
        { product_id: 'p2', product_name: '둘째 상품', qty: 3, subtotal: 3000 },
      ]),
    ).toBe('첫 상품 외 1건');
  });
});
