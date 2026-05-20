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
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, product_name: 'A', quantity: 30 },
    ];
    const pending: PendingShippingRow[] = [];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      {
        key: { kind: 'product', product_id: 'p1' },
        product_name: 'A',
        quantity: 30,
        reserved: 0,
        available: 30,
      },
    ]);
  });

  it('단일 상품 다중 검토대기 합산', () => {
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, product_name: 'A', quantity: 30 },
    ];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, quantity: 5 },
      { key: { kind: 'product', product_id: 'p1' }, quantity: 3 },
    ];
    expect(computeAvailableInventory(inv, pending)).toEqual([
      {
        key: { kind: 'product', product_id: 'p1' },
        product_name: 'A',
        quantity: 30,
        reserved: 8,
        available: 22,
      },
    ]);
  });

  it('보유 0이지만 검토대기가 있는 상품도 행에 포함', () => {
    const inv: InventoryRow[] = [];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'product', product_id: 'p2' }, quantity: 1 },
    ];
    const r = computeAvailableInventory(inv, pending);
    expect(r).toEqual([
      {
        key: { kind: 'product', product_id: 'p2' },
        product_name: '(알 수 없는 상품)',
        quantity: 0,
        reserved: 1,
        available: -1,
      },
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

  it('stock 예약만 가용 예치금에서 차감하고 배송대행 배송비는 안내 금액으로 둔다', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 30_000 }];
    const ship: PendingShippingFeeRow[] = [
      { id: 'u1', shipping_fee_total: 9_900 },
      { id: 'u2', shipping_fee_total: 6_600 },
    ];
    expect(computeAvailableDeposit(100_000, stock, ship)).toEqual({
      balance: 100_000,
      stockReserved: 30_000,
      shippingReserved: 0,
      available: 70_000,
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

describe('computeAvailableInventory — polymorphic keys', () => {
  it('groups by product_id and custom_inventory_id separately', () => {
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, product_name: '상품A', quantity: 10 },
      { key: { kind: 'custom', custom_inventory_id: 'c1' }, product_name: '수기A', quantity: 5 },
    ];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'product', product_id: 'p1' }, quantity: 3 },
      { key: { kind: 'custom', custom_inventory_id: 'c1' }, quantity: 2 },
    ];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(2);

    const p = rows.find((r) => r.key.kind === 'product' && r.key.product_id === 'p1')!;
    expect(p.available).toBe(7);
    expect(p.reserved).toBe(3);

    const c = rows.find((r) => r.key.kind === 'custom' && r.key.custom_inventory_id === 'c1')!;
    expect(c.available).toBe(3);
    expect(c.reserved).toBe(2);
  });

  it('does not collide product_id and custom_inventory_id with same uuid value', () => {
    const sharedId = 'shared-uuid';
    const inv: InventoryRow[] = [
      { key: { kind: 'product', product_id: sharedId }, product_name: 'P', quantity: 4 },
      { key: { kind: 'custom', custom_inventory_id: sharedId }, product_name: 'C', quantity: 6 },
    ];
    const pending: PendingShippingRow[] = [];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(2);
  });

  it('renders pending-only custom rows with (알 수 없는 상품)', () => {
    const inv: InventoryRow[] = [];
    const pending: PendingShippingRow[] = [
      { key: { kind: 'custom', custom_inventory_id: 'c-missing' }, quantity: 2 },
    ];
    const rows = computeAvailableInventory(inv, pending);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_name).toBe('(알 수 없는 상품)');
    expect(rows[0]!.available).toBe(-2);
  });
});
