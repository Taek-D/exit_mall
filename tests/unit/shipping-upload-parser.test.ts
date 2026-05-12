import { describe, it, expect } from 'vitest';
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
