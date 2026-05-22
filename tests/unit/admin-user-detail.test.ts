import { describe, it, expect } from 'vitest';
import {
  mergeUserOrders,
  summarizePurchasedInventoryReservations,
  sumNonCancelledAmounts,
  type AdminPurchasedInventoryLotRow,
  type AdminUserStockOrderInput,
  type AdminUserShippingUploadInput,
  type AdminUserLegacyOrderInput,
} from '@/lib/admin/user-detail';

describe('mergeUserOrders', () => {
  it('merges three sources sorted by created_at desc', () => {
    const stock: AdminUserStockOrderInput[] = [
      {
        id: 's1',
        total_amount: 30000,
        status: 'pending',
        items: [{ product_name: '샴푸', qty: 2, subtotal: 30000 }],
        created_at: '2026-05-10T10:00:00Z',
      },
    ];
    const shipping: AdminUserShippingUploadInput[] = [
      {
        id: 'u1',
        original_name: 'orders.xlsx',
        total_quantity: 5,
        shipping_fee_total: 16500,
        status: 'pending',
        created_at: '2026-05-11T09:00:00Z',
        upload_type: 'exitmall',
      },
    ];
    const legacy: AdminUserLegacyOrderInput[] = [
      {
        id: 'l1',
        total_amount: 50000,
        status: 'placed',
        created_at: '2026-05-09T08:00:00Z',
      },
    ];

    const merged = mergeUserOrders({ stock, shipping, legacy });
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ kind: 'shipping_upload', id: 'u1', amount: 16500 });
    expect(merged[1]).toMatchObject({ kind: 'stock_order', id: 's1', amount: 30000 });
    expect(merged[2]).toMatchObject({ kind: 'legacy', id: 'l1', amount: 50000 });
  });

  it('summarizes stock order items', () => {
    const merged = mergeUserOrders({
      stock: [
        {
          id: 's1',
          total_amount: 1000,
          status: 'approved',
          items: [
            { product_name: '샴푸', qty: 2, subtotal: 600 },
            { product_name: '비누', qty: 1, subtotal: 400 },
          ],
          created_at: '2026-05-10T10:00:00Z',
        },
      ],
      shipping: [],
      legacy: [],
    });
    expect(merged[0]?.summary).toBe('샴푸 외 1건');
  });

  it('uses original_name as summary for shipping uploads', () => {
    const merged = mergeUserOrders({
      stock: [],
      shipping: [
        {
          id: 'u1',
          original_name: 'orders.xlsx',
          total_quantity: 3,
          shipping_fee_total: 9900,
          status: 'pending',
          created_at: '2026-05-11T09:00:00Z',
          upload_type: 'exitmall',
        },
      ],
      legacy: [],
    });
    expect(merged[0]?.summary).toBe('orders.xlsx · 3개');
  });

  it('routes shippingKind from upload_type, defaulting legacy null rows to exitmall', () => {
    const merged = mergeUserOrders({
      stock: [],
      shipping: [
        {
          id: 'p1',
          original_name: 'purchased.xlsx',
          total_quantity: 2,
          shipping_fee_total: 6600,
          status: 'pending',
          created_at: '2026-05-12T09:00:00Z',
          upload_type: 'purchased',
        },
        {
          id: 'e1',
          original_name: 'exit.xlsx',
          total_quantity: 1,
          shipping_fee_total: 3300,
          status: 'pending',
          created_at: '2026-05-11T09:00:00Z',
          upload_type: null,
        },
      ],
      legacy: [],
    });
    const byId = new Map(merged.map((row) => [row.id, row]));
    expect(byId.get('p1')?.shippingKind).toBe('purchased');
    expect(byId.get('e1')?.shippingKind).toBe('exitmall');
  });
});

describe('sumNonCancelledAmounts', () => {
  it('sums total_amount of rows with status !== "cancelled"', () => {
    const rows = [
      { status: 'pending', total_amount: 10000 },
      { status: 'approved', total_amount: 20000 },
      { status: 'cancelled', total_amount: 5000 },
      { status: 'rejected', total_amount: 3000 },
    ];
    expect(sumNonCancelledAmounts(rows)).toBe(33000);
  });

  it('returns 0 for empty input', () => {
    expect(sumNonCancelledAmounts([])).toBe(0);
  });

  it('returns 0 when every row is cancelled', () => {
    expect(
      sumNonCancelledAmounts([
        { status: 'cancelled', total_amount: 1000 },
        { status: 'cancelled', total_amount: 2000 },
      ]),
    ).toBe(0);
  });
});

describe('summarizePurchasedInventoryReservations', () => {
  const lot: AdminPurchasedInventoryLotRow = {
    id: 'lot-1',
    product_name: 'Purchased item',
    option_name: null,
    initial_quantity: 10,
    remaining_quantity: 7,
    source_type: 'admin_manual',
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
  };

  it('adds pending reservations and the latest admin memo', () => {
    const rows = summarizePurchasedInventoryReservations(
      [lot],
      [{ lot_id: 'lot-1', quantity: 3 }],
      [
        { lot_id: 'lot-1', memo: 'older memo', created_at: '2026-05-20T11:00:00Z' },
        { lot_id: 'lot-1', memo: 'latest memo', created_at: '2026-05-20T12:00:00Z' },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'lot-1',
      option_name: '',
      reserved_quantity: 3,
      admin_memo: 'latest memo',
    });
  });

  it('treats the latest blank or null memo as clearing the previous memo', () => {
    const blankRows = summarizePurchasedInventoryReservations(
      [lot],
      [],
      [
        { lot_id: 'lot-1', memo: 'older memo', created_at: '2026-05-20T11:00:00Z' },
        { lot_id: 'lot-1', memo: '   ', created_at: '2026-05-20T12:00:00Z' },
      ],
    );
    const nullRows = summarizePurchasedInventoryReservations(
      [lot],
      [],
      [
        { lot_id: 'lot-1', memo: 'older memo', created_at: '2026-05-20T11:00:00Z' },
        { lot_id: 'lot-1', memo: null, created_at: '2026-05-20T12:00:00Z' },
      ],
    );

    expect(blankRows[0]?.admin_memo).toBeNull();
    expect(nullRows[0]?.admin_memo).toBeNull();
  });

  it('sets admin_memo to null when no memo rows are supplied', () => {
    const rows = summarizePurchasedInventoryReservations([lot], []);

    expect(rows[0]).toMatchObject({
      reserved_quantity: 0,
      admin_memo: null,
    });
  });
});
