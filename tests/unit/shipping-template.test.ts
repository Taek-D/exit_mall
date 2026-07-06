import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'public', 'shipping-template.xlsx');
const EXPECTED_HEADER = [
  '내품코드',
  '고객주문번호',
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
  it('uses the current customer-order-number headers on the first row', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;

    const header = EXPECTED_HEADER.map((_, index) => ws.getRow(1).getCell(index + 1).value);
    expect(header).toEqual(EXPECTED_HEADER);
  });

  it('keeps the attached workbook tracking-number format unchanged', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;

    expect(ws.getColumn(10).numFmt).toBeUndefined();
    expect(ws.getRow(2).getCell(10).numFmt).toBeUndefined();
  });

  it('parses blank tracking number in the customer template as null', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;
    ws.addRow([
      '김신청',
      '20260518-001',
      '홍길동',
      '010-1234-5678',
      '서울시 강남구 1',
      '스니커즈',
      '270',
      1,
      '문 앞',
      '',
    ]);
    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseShippingExcel(Buffer.from(buffer as ArrayBuffer));

    expect(parsed.items[0]).toMatchObject({
      internal_code: '김신청',
      recipient: '홍길동',
      tracking_number: null,
    });
  });
});
