import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'public', 'shipping-template.xlsx');
const EXPECTED_HEADER = [
  'No',
  '받는분성명',
  '받는분전화번호',
  '받는분주소(전체, 분할)',
  '품목명',
  '내품명',
  '내품수량',
  '배송메세지1',
  '송장번호',
];

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  return wb;
}

describe('public shipping template', () => {
  it('uses the current CJ-style headers', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;

    const header = EXPECTED_HEADER.map((_, index) => ws.getRow(8).getCell(index + 1).value);
    expect(header).toEqual(EXPECTED_HEADER);
  });

  it('keeps the tracking-number column formatted as text', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;

    expect(ws.getColumn(9).numFmt).toBe('@');
    for (let row = 8; row <= 1008; row += 1) {
      expect(ws.getRow(row).getCell(9).numFmt).toBe('@');
    }
  });

  it('parses blank tracking number in the customer template as null', async () => {
    const parsed = await parseShippingExcel(fs.readFileSync(TEMPLATE_PATH));

    expect(parsed.items[0]).toMatchObject({
      recipient: '홍길동',
      tracking_number: null,
    });
  });
});
