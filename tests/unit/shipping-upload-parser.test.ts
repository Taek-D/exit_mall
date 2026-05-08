import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseShippingExcel,
  computeShippingFee,
  SHIPPING_FEE_PER_ROW,
} from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

describe('parseShippingExcel — valid', () => {
  it('정상 양식 3행을 파싱', () => {
    const r = parseShippingExcel(load('shipping-valid.xlsx'));
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({
      no: 1,
      recipient: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 1',
      product_code: 'SKR-001',
      product_name: '스니커즈/270',
      quantity: 1,
      memo: '문 앞',
      tracking_number: null,
    });
    expect(r.total_quantity).toBe(4);
    expect(r.shipping_fee_total).toBe(3 * 3_300);
    expect(r.uploader_company).toBe('예시상사');
    expect(r.uploader_phone).toBe('010-1111-1111');
  });
});

describe('parseShippingExcel — errors', () => {
  it('빈 양식', () => {
    expect(() => parseShippingExcel(load('shipping-empty.xlsx'))).toThrow(/한 줄도 입력되지 않았/);
  });
  it('받는사람 누락', () => {
    expect(() => parseShippingExcel(load('shipping-missing-recipient.xlsx'))).toThrow(/받는사람/);
  });
  it('잘못된 수량', () => {
    expect(() => parseShippingExcel(load('shipping-bad-quantity.xlsx'))).toThrow(/수량/);
  });
});

describe('parseShippingExcel — tracking 컬럼 보존', () => {
  it('송장번호가 채워진 행은 그대로 보존, 없는 행은 null', () => {
    const r = parseShippingExcel(load('shipping-with-tracking.xlsx'));
    expect(r.items[0]!.tracking_number).toBe('632012345678');
    expect(r.items[1]!.tracking_number).toBeNull();
  });
});

describe('computeShippingFee', () => {
  it('행수 × 3,300', () => {
    expect(computeShippingFee(0)).toBe(0);
    expect(computeShippingFee(1)).toBe(3_300);
    expect(computeShippingFee(5)).toBe(16_500);
  });
});

describe('SHIPPING_FEE_PER_ROW 상수', () => {
  it('3300', () => {
    expect(SHIPPING_FEE_PER_ROW).toBe(3_300);
  });
});
