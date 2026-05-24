import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import {
  parseShippingExcel,
  computeShippingFee,
  SHIPPING_FEE_PER_ROW,
} from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

async function workbookBuffer(header: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('배송대행');
  ws.addRows([
    ['배송대행 양식', '', '', '', '', '', '', '', ''],
    [],
    ['상호', '예시상사', '담당자 연락처', '010-1111-1111', '', '', '', '', ''],
    ['요청사항', '안전 배송', '', '', '', '', '', '', ''],
    [],
    [],
    [],
    header,
    ...rows,
  ]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

async function workbookBufferFromFirstRow(header: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRows([header, ...rows]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function hancellAppPropertiesXml(sheetName = 'Sheet1'): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    '<ep:Properties',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    ' xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<ep:Application>Cell</ep:Application>',
    `<ep:TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${sheetName}</vt:lpstr></vt:vector></ep:TitlesOfParts>`,
    '<ep:TotalTime>6</ep:TotalTime>',
    '<ep:AppVersion>12.0300</ep:AppVersion>',
    '</ep:Properties>',
  ].join('');
}

async function withHancellAppProperties(
  buffer: Buffer,
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', hancellAppPropertiesXml(sheetName));
  const rewritten = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(rewritten);
}

describe('parseShippingExcel - valid', () => {
  it('parses a valid 3-row template', async () => {
    const r = await parseShippingExcel(load('shipping-valid.xlsx'));
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({
      no: 1,
      recipient: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 1',
      product_code: '스니커즈',
      product_name: '270',
      quantity: 1,
      memo: '문 앞',
      tracking_number: null,
    });
    expect(r.total_quantity).toBe(4);
    expect(r.shipping_fee_total).toBe(3 * 3_300);
    expect(r.uploader_company).toBe('예시상사');
    expect(r.uploader_phone).toBe('010-1111-1111');
  });

  it('parses Hancell-saved workbooks whose document properties break raw exceljs', async () => {
    const buffer = await withHancellAppProperties(load('shipping-valid.xlsx'));

    const parsed = await parseShippingExcel(buffer);

    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      phone: '010-1234-5678',
      quantity: 1,
    });
  });

  it('accepts required-marker stars in headers', async () => {
    const r = await parseShippingExcel(
      await workbookBuffer(
        ['No', '받는사람*', '연락처*', '주소*', '상품명*', '옵션', '수량*', '메모', '송장번호'],
        [[1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', '']],
      ),
    );

    expect(r.items[0]).toMatchObject({
      product_code: '스니커즈',
      product_name: '270',
      quantity: 1,
    });
  });

  it('accepts new CJ-style headers (받는분성명, 받는분주소(전체, 분할), 품목명, 내품명, 내품수량, 배송메세지1)', async () => {
    const r = await parseShippingExcel(
      await workbookBuffer(
        [
          'No',
          '받는분성명',
          '받는분전화번호',
          '받는분주소(전체, 분할)',
          '품목명',
          '내품명',
          '내품수량',
          '배송메세지1',
          '송장번호',
        ],
        [[1, '홍길동', '010-1234-5678', '서울시 강남구 1', '스니커즈', '270', 2, '문 앞', '']],
      ),
    );

    expect(r.items[0]).toMatchObject({
      no: 1,
      recipient: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 1',
      product_code: '스니커즈',
      product_name: '270',
      quantity: 2,
      memo: '문 앞',
      tracking_number: null,
    });
  });

  it('accepts the customer-order-number template from the first row without storing column A', async () => {
    const r = await parseShippingExcel(
      await workbookBufferFromFirstRow(
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
        [
          [
            '20260518-001',
            '홍길동',
            '010-1234-5678',
            '서울시 강남구 1',
            '스니커즈',
            '270',
            2,
            '문 앞',
            '',
          ],
        ],
      ),
    );

    expect(r.items[0]).toMatchObject({
      no: 1,
      recipient: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 1',
      product_code: '스니커즈',
      product_name: '270',
      quantity: 2,
      memo: '문 앞',
      tracking_number: null,
    });
    expect(r.items[0]).not.toHaveProperty('customer_order_number');
    expect(r.uploader_company).toBeNull();
    expect(r.uploader_phone).toBeNull();
    expect(r.request_memo).toBeNull();
  });

  it('preserves numeric tracking numbers as integer strings (no scientific notation)', async () => {
    // CJ 송장번호는 10~12자리 — 셀이 number로 들어와도 정수 문자열로 보존되어야 함
    const r = await parseShippingExcel(
      await workbookBuffer(
        ['No', '받는사람', '연락처', '주소', '상품명', '옵션', '수량', '메모', '송장번호'],
        [[1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', 521853092894]],
      ),
    );
    expect(r.items[0]?.tracking_number).toBe('521853092894');
  });
});

describe('parseShippingExcel - errors', () => {
  it('explains when an inbound inventory template is uploaded to shipping upload', async () => {
    await expect(
      parseShippingExcel(
        await workbookBufferFromFirstRow(
          ['발송일', '상품명', '옵션', '재고수량', '사은품', '택배사', '송장번호', '비고'],
          [['2026-05-19', '샴푸', '500ml', 12, 'Y', 'CJ', '1234567890', '정상']],
        ),
      ),
    ).rejects.toThrow(/입고리스트 양식이 업로드되었습니다/);
  });

  it('rejects empty templates', async () => {
    await expect(parseShippingExcel(load('shipping-empty.xlsx'))).rejects.toThrow(
      /한 줄도 입력되지 않았/,
    );
  });

  it('rejects missing recipients', async () => {
    await expect(parseShippingExcel(load('shipping-missing-recipient.xlsx'))).rejects.toThrow(
      /받는사람/,
    );
  });

  it('rejects invalid quantities', async () => {
    await expect(parseShippingExcel(load('shipping-bad-quantity.xlsx'))).rejects.toThrow(/수량/);
  });

  it('rejects missing product names', async () => {
    await expect(
      parseShippingExcel(
        await workbookBuffer(
          ['No', '받는사람', '연락처', '주소', '상품명', '옵션', '수량', '메모', '송장번호'],
          [[1, '홍길동', '010-1234-5678', '서울시 1', '', '270', 1, '', '']],
        ),
      ),
    ).rejects.toThrow(/상품명이 비어있습니다/);
  });
});

describe('parseShippingExcel - tracking column preservation', () => {
  it('keeps filled tracking numbers and maps blanks to null', async () => {
    const r = await parseShippingExcel(load('shipping-with-tracking.xlsx'));
    expect(r.items[0]!.tracking_number).toBe('632012345678');
    expect(r.items[1]!.tracking_number).toBeNull();
  });
});

describe('computeShippingFee', () => {
  it('multiplies rows by 3,300', () => {
    expect(computeShippingFee(0)).toBe(0);
    expect(computeShippingFee(1)).toBe(3_300);
    expect(computeShippingFee(5)).toBe(16_500);
  });
});

describe('SHIPPING_FEE_PER_ROW constant', () => {
  it('is 3300', () => {
    expect(SHIPPING_FEE_PER_ROW).toBe(3_300);
  });
});
