import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { parseOrderExcel } from '@/lib/order-upload-parser';

const SAMPLE = path.join(__dirname, '..', 'sample_order.xlsx');

describe('parseOrderExcel - blank template', () => {
  it('rejects empty template (no items)', () => {
    const buf = fs.readFileSync(SAMPLE);
    expect(() => parseOrderExcel(buf)).toThrow(/주문 항목/);
  });
});

describe('parseOrderExcel - filled-in workbook', () => {
  function buildFilledBuffer(): Buffer {
    const buf = fs.readFileSync(SAMPLE);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Header section
    XLSX.utils.sheet_add_aoa(ws, [['2026-05-06']], { origin: 'B5' });
    XLSX.utils.sheet_add_aoa(ws, [['HG-001']], { origin: 'F5' });
    XLSX.utils.sheet_add_aoa(ws, [['홍길동상사']], { origin: 'B6' });
    XLSX.utils.sheet_add_aoa(ws, [['홍길동']], { origin: 'F6' });
    XLSX.utils.sheet_add_aoa(ws, [['010-1234-5678']], { origin: 'B7' });
    XLSX.utils.sheet_add_aoa(ws, [['hong@test.com']], { origin: 'F7' });
    XLSX.utils.sheet_add_aoa(ws, [['서울시 강남구 테헤란로 1']], { origin: 'B8' });
    XLSX.utils.sheet_add_aoa(ws, [['도착 후 전화 부탁드립니다']], { origin: 'B9' });

    // Items: row 12-14
    XLSX.utils.sheet_add_aoa(ws, [['브랜드A', 'CODE-001', '상품 A', '옵션X', 5, 10000, 50000, '메모1', '오전배송']], {
      origin: 'B12',
    });
    XLSX.utils.sheet_add_aoa(ws, [['브랜드B', 'CODE-002', '상품 B', null, 2, 7500, 15000, null, null]], {
      origin: 'B13',
    });
    XLSX.utils.sheet_add_aoa(ws, [['브랜드C', 'CODE-003', '상품 C', '대형', 1, 33000, 33000, null, null]], {
      origin: 'B14',
    });

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('parses header fields correctly', () => {
    const parsed = parseOrderExcel(buildFilledBuffer());
    expect(parsed.order_date).toBe('2026-05-06');
    expect(parsed.buyer_order_number).toBe('HG-001');
    expect(parsed.company_name).toBe('홍길동상사');
    expect(parsed.contact_person).toBe('홍길동');
    expect(parsed.buyer_phone).toBe('010-1234-5678');
    expect(parsed.buyer_email).toBe('hong@test.com');
    expect(parsed.shipping_address).toBe('서울시 강남구 테헤란로 1');
    expect(parsed.request_memo).toBe('도착 후 전화 부탁드립니다');
  });

  it('parses items and totals', () => {
    const parsed = parseOrderExcel(buildFilledBuffer());
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      no: 1,
      brand: '브랜드A',
      code: 'CODE-001',
      name: '상품 A',
      option: '옵션X',
      quantity: 5,
      unit_price: 10000,
      memo: '메모1',
      shipping_request: '오전배송',
    });
    expect(parsed.total_quantity).toBe(8);
    expect(parsed.total_amount).toBe(98000);
  });

  it('rejects rows with negative or non-integer quantity', () => {
    const buf = fs.readFileSync(SAMPLE);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    XLSX.utils.sheet_add_aoa(ws, [['B', 'C', '잘못된상품', null, 0, 1000, 0, null, null]], {
      origin: 'B12',
    });
    const out = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    expect(() => parseOrderExcel(out)).toThrow(/수량/);
  });
});
