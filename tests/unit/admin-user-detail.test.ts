import { describe, it, expect } from 'vitest';
import {
  buildInventoryProductOptions,
  mergeUserOrders,
  summarizePurchasedInventoryByProduct,
  summarizePurchasedInventoryReservations,
  sumNonCancelledAmounts,
  type AdminPurchasedInventoryLotRow,
  type AdminPurchasedInventoryRow,
  type AdminUserStockOrderInput,
  type AdminUserShippingUploadInput,
  type AdminUserLegacyOrderInput,
} from '@/lib/admin/user-detail';

describe('buildInventoryProductOptions', () => {
  // 판매중지된 상품이라도 보유 재고가 남아 있으면 수동 조정 목록에 떠야 한다.
  // 목록이 판매중 상품만 담고 있어 운영자가 차감하지 못한 사고가 있었다.
  const owned = [
    { product_id: 'p-stopped', quantity: 3, products: { name: '안국약품 토비콤' } },
    { product_id: 'p-live', quantity: 1, products: { name: '가나다 크림' } },
  ];
  const sellable = [
    { id: 'p-live', name: '가나다 크림' },
    { id: 'p-other', name: '나나나 세럼' },
  ];

  it('판매중 목록에 없는 보유 상품도 포함한다', () => {
    const options = buildInventoryProductOptions(owned, sellable);

    expect(options.map((o) => o.id)).toContain('p-stopped');
  });

  it('보유분을 앞에 두고 각 구간을 이름순으로 정렬한다', () => {
    const options = buildInventoryProductOptions(owned, sellable);

    expect(options.map((o) => o.id)).toEqual(['p-live', 'p-stopped', 'p-other']);
  });

  it('보유 중인 상품을 판매중 목록과 중복해서 싣지 않는다', () => {
    const ids = buildInventoryProductOptions(owned, sellable).map((o) => o.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('상품명 조인이 비어도 목록에서 빠지지 않는다', () => {
    const options = buildInventoryProductOptions(
      [{ product_id: 'p-noname', quantity: 2, products: null }],
      [],
    );

    expect(options).toEqual([{ id: 'p-noname', name: '(이름 없음)' }]);
  });
});

describe('summarizePurchasedInventoryByProduct', () => {
  // 운영자가 로트를 눈으로 더하던 작업을 대신한다.
  const lot = (over: Partial<AdminPurchasedInventoryRow>): AdminPurchasedInventoryRow => ({
    id: 'lot',
    product_name: '미백앰플',
    option_name: '',
    initial_quantity: 10,
    remaining_quantity: 10,
    reserved_quantity: 0,
    source_type: 'inbound_request',
    admin_memo: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    ...over,
  });

  it('같은 상품의 로트 잔여·예약 수량을 합친다', () => {
    const summary = summarizePurchasedInventoryByProduct([
      lot({ id: 'a', remaining_quantity: 12 }),
      lot({ id: 'b', remaining_quantity: 20, reserved_quantity: 3 }),
      lot({ id: 'c', remaining_quantity: 10 }),
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ label: '미백앰플', remaining: 42, reserved: 3 });
  });

  it('소진된 로트는 합계에서 제외한다', () => {
    const summary = summarizePurchasedInventoryByProduct([
      lot({ id: 'a', remaining_quantity: 5 }),
      lot({ id: 'b', remaining_quantity: 0 }),
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]?.remaining).toBe(5);
  });

  it('상품명이 같아도 옵션이 다르면 따로 센다', () => {
    const summary = summarizePurchasedInventoryByProduct([
      lot({ id: 'a', option_name: '50ml', remaining_quantity: 4 }),
      lot({ id: 'b', option_name: '100ml', remaining_quantity: 7 }),
    ]);

    expect(summary.map((row) => [row.label, row.remaining])).toEqual([
      ['미백앰플 (100ml)', 7],
      ['미백앰플 (50ml)', 4],
    ]);
  });

  it('상품명 순으로 정렬한다', () => {
    const summary = summarizePurchasedInventoryByProduct([
      lot({ id: 'a', product_name: '워터 에센스' }),
      lot({ id: 'b', product_name: '미백앰플' }),
      lot({ id: 'c', product_name: '바이오플러스' }),
    ]);

    expect(summary.map((row) => row.label)).toEqual(['미백앰플', '바이오플러스', '워터 에센스']);
  });

  it('전부 소진되면 빈 목록을 준다', () => {
    expect(summarizePurchasedInventoryByProduct([lot({ remaining_quantity: 0 })])).toEqual([]);
  });
});

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
