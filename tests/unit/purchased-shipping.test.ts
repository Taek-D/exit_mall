import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  allocatePurchasedInventoryFifo,
  parseInboundInventoryExcel,
  summarizePurchasedInventory,
  type PurchasedInventoryLot,
} from '@/lib/purchased-shipping';

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

  it('rejects invalid stock quantities', async () => {
    await expect(
      parseInboundInventoryExcel(await workbookBuffer([['', '샴푸', '500ml', 0]])),
    ).rejects.toThrow(/재고수량/);
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
