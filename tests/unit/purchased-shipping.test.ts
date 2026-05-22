import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  allocatePurchasedInventoryFifo,
  buildPurchasedLotsForUpload,
  detectPurchasedInventoryAmbiguities,
  parseInboundInventoryExcel,
  summarizePurchasedInventory,
  type PurchasedInventoryLot,
  type PurchasedLotForUploadRow,
} from '@/lib/purchased-shipping';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRows([
    ['발송일', '상품명', '옵션', '재고수량', '사은품', '택배사', '송장번호', '비고'],
    ...rows,
  ]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

async function shippingWorkbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRows([
    [
      '고객주문번호',
      '받는분성명',
      '받는분전화번호',
      '받는분주소(전체, 분할)',
      '품목명',
      '내품명',
      '내품수량',
      '배송메세지1',
      '송장번호',
    ],
    ...rows,
  ]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

describe('buildPurchasedLotsForUpload', () => {
  const baseLot = {
    product_name: 'Tobi Com',
    option_name: '500ml',
    remaining_quantity: 10,
    created_at: '2026-05-01T00:00:00.000Z',
  };

  it('includes manual and completed inbound lots, excludes incomplete inbound lots, and subtracts reservations', () => {
    const rows: PurchasedLotForUploadRow[] = [
      {
        ...baseLot,
        id: 'manual',
        source_type: 'admin_manual',
        inbound_requests: null,
      },
      {
        ...baseLot,
        id: 'completed-object',
        source_type: 'inbound_request',
        inbound_requests: { status: 'completed' },
      },
      {
        ...baseLot,
        id: 'completed-array',
        source_type: 'inbound_request',
        inbound_requests: [{ status: 'completed' }],
      },
      {
        ...baseLot,
        id: 'open',
        source_type: 'inbound_request',
        inbound_requests: { status: 'open' },
      },
      {
        ...baseLot,
        id: 'in-progress',
        source_type: 'inbound_request',
        inbound_requests: [{ status: 'in_progress' }],
      },
      {
        ...baseLot,
        id: 'null-status',
        source_type: 'inbound_request',
        inbound_requests: { status: null },
      },
      {
        ...baseLot,
        id: 'missing-inbound',
        source_type: 'inbound_request',
        inbound_requests: null,
      },
    ];

    const lots = buildPurchasedLotsForUpload(
      rows,
      new Map([
        ['manual', 3],
        ['completed-object', 50],
        ['completed-array', 4],
        ['open', 8],
      ]),
    );

    expect(lots).toEqual([
      {
        id: 'manual',
        product_name: 'Tobi Com',
        option_name: '500ml',
        available_quantity: 7,
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'completed-object',
        product_name: 'Tobi Com',
        option_name: '500ml',
        available_quantity: 0,
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'completed-array',
        product_name: 'Tobi Com',
        option_name: '500ml',
        available_quantity: 6,
        created_at: '2026-05-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('parseInboundInventoryExcel', () => {
  it('parses product name, option, and stock quantity from the inbound template', async () => {
    const parsed = await parseInboundInventoryExcel(
      await workbookBuffer([
        ['2026-05-19', '샴푸', '500ml', 12, 'Y', 'CJ', '1234567890', '정상'],
        ['', '린스', '', '3', '', '', '', '옵션 없음'],
      ]),
    );

    expect(parsed).toEqual([
      {
        row_number: 2,
        product_name: '샴푸',
        option_name: '500ml',
        quantity: 12,
        gift: 'Y',
        carrier: 'CJ',
        tracking_number: '1234567890',
        memo: '정상',
      },
      {
        row_number: 3,
        product_name: '린스',
        option_name: '',
        quantity: 3,
        gift: null,
        carrier: null,
        tracking_number: null,
        memo: '옵션 없음',
      },
    ]);
  });

  it('rejects empty inbound inventory files', async () => {
    await expect(parseInboundInventoryExcel(await workbookBuffer([]))).rejects.toThrow(
      /입고 품목/,
    );
  });

  it('explains when a shipping template is uploaded to inbound requests', async () => {
    await expect(
      parseInboundInventoryExcel(
        await shippingWorkbookBuffer([
          [
            '20260518-001',
            '홍길동',
            '010-1234-5678',
            '서울시 강남구 1',
            '샴푸',
            '500ml',
            2,
            '문 앞',
            '',
          ],
        ]),
      ),
    ).rejects.toThrow(/배송대행 양식이 업로드되었습니다/);
  });

  it('rejects invalid stock quantities', async () => {
    await expect(
      parseInboundInventoryExcel(await workbookBuffer([['', '샴푸', '500ml', 0]])),
    ).rejects.toThrow(/재고수량/);
  });

  it('rejects product names longer than 100 chars before the RPC fires', async () => {
    // purchased_inventory_lots.product_name caps trimmed length at 100, so a
    // longer name would only fail on admin completion. Surface it at upload.
    const longName = 'ㄱ'.repeat(101);
    await expect(
      parseInboundInventoryExcel(await workbookBuffer([['', longName, '500ml', 1]])),
    ).rejects.toThrow(/100자/);
  });
});

describe('allocatePurchasedInventoryFifo', () => {
  const lots: PurchasedInventoryLot[] = [
    {
      id: 'old',
      product_name: '샴푸',
      option_name: '500ml',
      available_quantity: 5,
      created_at: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'new',
      product_name: '샴푸',
      option_name: '500ml',
      available_quantity: 10,
      created_at: '2026-05-10T00:00:00.000Z',
    },
    {
      id: 'other-option',
      product_name: '샴푸',
      option_name: '1L',
      available_quantity: 7,
      created_at: '2026-05-02T00:00:00.000Z',
    },
  ];

  it('allocates from the oldest matching inbound lot first', () => {
    const result = allocatePurchasedInventoryFifo(lots, [
      { item_no: 1, product_name: '샴푸', option_name: '500ml', quantity: 8 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toEqual([
      { item_no: 1, lot_id: 'old', quantity: 5 },
      { item_no: 1, lot_id: 'new', quantity: 3 },
    ]);
  });

  it('keeps product options separate', () => {
    const result = allocatePurchasedInventoryFifo(lots, [
      { item_no: 1, product_name: '샴푸', option_name: '1L', quantity: 6 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toEqual([{ item_no: 1, lot_id: 'other-option', quantity: 6 }]);
  });

  it('reports shortages with requested and available quantities', () => {
    const result = allocatePurchasedInventoryFifo(lots, [
      { item_no: 1, product_name: '샴푸', option_name: '500ml', quantity: 20 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.shortages).toEqual([
      { product_name: '샴푸', option_name: '500ml', requested: 20, available: 15 },
    ]);
  });
  it('matches purchased stock product and option while ignoring whitespace', () => {
    const result = allocatePurchasedInventoryFifo(
      [
        {
          id: 'lot-space',
          product_name: 'Tobi  Com',
          option_name: '500 ml',
          available_quantity: 4,
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      [
        {
          item_no: 1,
          product_name: 'TobiCom',
          option_name: '500ml',
          quantity: 3,
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toEqual([{ item_no: 1, lot_id: 'lot-space', quantity: 3 }]);
  });
});

describe('detectPurchasedInventoryAmbiguities', () => {
  it('reports distinct purchased labels that collapse to the same product and option key', () => {
    const ambiguities = detectPurchasedInventoryAmbiguities([
      {
        id: 'lot-1',
        product_name: 'A BC',
        option_name: '500 ml',
        available_quantity: 1,
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'lot-2',
        product_name: 'AB C',
        option_name: '500ml',
        available_quantity: 1,
        created_at: '2026-05-02T00:00:00.000Z',
      },
    ]);

    expect(ambiguities).toEqual([
      { key: 'ABC\u0000500ml', labels: ['A BC / 500 ml', 'AB C / 500ml'] },
    ]);
  });
});

describe('summarizePurchasedInventory', () => {
  it('keeps zero-quantity rows visible', () => {
    const rows = summarizePurchasedInventory(
      [
        {
          id: 'lot1',
          product_name: '샴푸',
          option_name: '500ml',
          initial_quantity: 10,
          remaining_quantity: 0,
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      [],
    );

    expect(rows).toEqual([
      {
        product_name: '샴푸',
        option_name: '500ml',
        total_quantity: 10,
        reserved_quantity: 0,
        available_quantity: 0,
      },
    ]);
  });
});
