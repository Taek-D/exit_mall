import { describe, it, expect } from 'vitest';
import {
  mergeUserOrders,
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
        },
      ],
      legacy: [],
    });
    expect(merged[0]?.summary).toBe('orders.xlsx · 3개');
  });
});
