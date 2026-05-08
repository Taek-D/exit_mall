import { describe, it, expect } from 'vitest';
import {
  computeAvailableInventory,
  computeAvailableDeposit,
  type InventoryRow,
  type PendingShippingRow,
  type PendingStockOrderRow,
  type PendingShippingFeeRow,
} from '@/lib/inventory';

describe('computeAvailableInventory', () => {
  it('예약 없을 때 가용 = quantity', () => {
    const inv: InventoryRow[] = [{ product_id: 'p1', product_name: 'A', quantity: 30 }];
    const pending: PendingShippingRow[] = [];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      { product_id: 'p1', product_name: 'A', quantity: 30, reserved: 0, available: 30 },
    ]);
  });

  it('단일 상품 다중 검토대기 합산', () => {
    const inv: InventoryRow[] = [{ product_id: 'p1', product_name: 'A', quantity: 30 }];
    const pending: PendingShippingRow[] = [
      { product_id: 'p1', quantity: 5 },
      { product_id: 'p1', quantity: 3 },
    ];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      { product_id: 'p1', product_name: 'A', quantity: 30, reserved: 8, available: 22 },
    ]);
  });

  it('보유 0이지만 검토대기가 있는 상품도 행에 포함', () => {
    const inv: InventoryRow[] = [];
    const pending: PendingShippingRow[] = [{ product_id: 'p2', quantity: 1 }];
    const r = computeAvailableInventory(inv, pending);
    expect(r).toEqual([
      { product_id: 'p2', product_name: '(알 수 없는 상품)', quantity: 0, reserved: 1, available: -1 },
    ]);
  });
});

describe('computeAvailableDeposit', () => {
  it('예약 없을 때 가용 = balance', () => {
    expect(computeAvailableDeposit(100_000, [], [])).toEqual({
      balance: 100_000,
      stockReserved: 0,
      shippingReserved: 0,
      available: 100_000,
    });
  });

  it('stock + shipping 예약 모두 차감', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 30_000 }];
    const ship: PendingShippingFeeRow[] = [
      { id: 'u1', shipping_fee_total: 9_900 },
      { id: 'u2', shipping_fee_total: 6_600 },
    ];
    expect(computeAvailableDeposit(100_000, stock, ship)).toEqual({
      balance: 100_000,
      stockReserved: 30_000,
      shippingReserved: 16_500,
      available: 53_500,
    });
  });

  it('가용은 음수가 될 수 있다 (실제 처리 시 차단됨)', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 200_000 }];
    expect(computeAvailableDeposit(100_000, stock, [])).toEqual({
      balance: 100_000,
      stockReserved: 200_000,
      shippingReserved: 0,
      available: -100_000,
    });
  });
});
