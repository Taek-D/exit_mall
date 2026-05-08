import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

describe('재업로드 부분 송장', () => {
  it('일부 행만 송장이 채워진 엑셀을 그대로 파싱', () => {
    const r = parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(r.items.map((it) => it.tracking_number)).toEqual([
      '632012345678',
      null,
      '632099998888',
    ]);
  });

  it('원본/재업로드 행수 일치 검사 헬퍼', () => {
    const a = parseShippingExcel(load('shipping-valid.xlsx'));
    const b = parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(a.items.length).toBe(3);
    expect(b.items.length).toBe(3);
    expect(a.items.length === b.items.length).toBe(true);
  });
});
