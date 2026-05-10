import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

describe('tracking reupload parsing', () => {
  it('parses partial tracking reuploads as-is', async () => {
    const r = await parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(r.items.map((it) => it.tracking_number)).toEqual([
      '632012345678',
      null,
      '632099998888',
    ]);
  });

  it('keeps original and reupload row counts comparable', async () => {
    const a = await parseShippingExcel(load('shipping-valid.xlsx'));
    const b = await parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(a.items.length).toBe(3);
    expect(b.items.length).toBe(3);
    expect(a.items.length === b.items.length).toBe(true);
  });
});
