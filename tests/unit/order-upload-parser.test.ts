import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { parseOrderExcel } from '@/lib/order-upload-parser';

const SAMPLE = path.join(__dirname, '..', 'sample_order.xlsx');

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

async function writeWorkbook(wb: ExcelJS.Workbook): Promise<Buffer> {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe('parseOrderExcel - blank template', () => {
  it('rejects empty template (no items)', async () => {
    const buf = fs.readFileSync(SAMPLE);
    await expect(parseOrderExcel(buf)).rejects.toThrow(/주문 항목/);
  });
});

describe('parseOrderExcel - filled-in workbook', () => {
  async function buildFilledBuffer(): Promise<Buffer> {
    const wb = await loadWorkbook(fs.readFileSync(SAMPLE));
    const ws = wb.worksheets[0]!;

    ws.getCell('B5').value = '2026-05-06';
    ws.getCell('F5').value = 'HG-001';
    ws.getCell('B6').value = '홍길동상사';
    ws.getCell('F6').value = '홍길동';
    ws.getCell('B7').value = '010-1234-5678';
    ws.getCell('F7').value = 'hong@test.com';
    ws.getCell('B8').value = '서울시 강남구 테헤란로 1';
    ws.getCell('B9').value = '도착 후 전화 부탁드립니다';

    ws.getRow(12).getCell(2).value = '브랜드A';
    ws.getRow(12).getCell(3).value = 'CODE-001';
    ws.getRow(12).getCell(4).value = '상품 A';
    ws.getRow(12).getCell(5).value = '옵션X';
    ws.getRow(12).getCell(6).value = 5;
    ws.getRow(12).getCell(7).value = 10000;
    ws.getRow(12).getCell(8).value = 50000;
    ws.getRow(12).getCell(9).value = '메모1';
    ws.getRow(12).getCell(10).value = '오전배송';

    ws.getRow(13).getCell(2).value = '브랜드B';
    ws.getRow(13).getCell(3).value = 'CODE-002';
    ws.getRow(13).getCell(4).value = '상품 B';
    ws.getRow(13).getCell(6).value = 2;
    ws.getRow(13).getCell(7).value = 7500;
    ws.getRow(13).getCell(8).value = 15000;

    ws.getRow(14).getCell(2).value = '브랜드C';
    ws.getRow(14).getCell(3).value = 'CODE-003';
    ws.getRow(14).getCell(4).value = '상품 C';
    ws.getRow(14).getCell(5).value = '대형';
    ws.getRow(14).getCell(6).value = 1;
    ws.getRow(14).getCell(7).value = 33000;
    ws.getRow(14).getCell(8).value = 33000;

    return writeWorkbook(wb);
  }

  it('parses header fields correctly', async () => {
    const parsed = await parseOrderExcel(await buildFilledBuffer());
    expect(parsed.order_date).toBe('2026-05-06');
    expect(parsed.buyer_order_number).toBe('HG-001');
    expect(parsed.company_name).toBe('홍길동상사');
    expect(parsed.contact_person).toBe('홍길동');
    expect(parsed.buyer_phone).toBe('010-1234-5678');
    expect(parsed.buyer_email).toBe('hong@test.com');
    expect(parsed.shipping_address).toBe('서울시 강남구 테헤란로 1');
    expect(parsed.request_memo).toBe('도착 후 전화 부탁드립니다');
  });

  it('parses items and totals', async () => {
    const parsed = await parseOrderExcel(await buildFilledBuffer());
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

  it('rejects rows with negative or non-integer quantity', async () => {
    const wb = await loadWorkbook(fs.readFileSync(SAMPLE));
    const row = wb.worksheets[0]!.getRow(12);
    row.getCell(2).value = 'B';
    row.getCell(3).value = 'C';
    row.getCell(4).value = '잘못된상품';
    row.getCell(6).value = 0;
    row.getCell(7).value = 1000;
    row.getCell(8).value = 0;
    await expect(parseOrderExcel(await writeWorkbook(wb))).rejects.toThrow(/수량/);
  });
});
