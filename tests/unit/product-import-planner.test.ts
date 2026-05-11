import { describe, expect, it } from 'vitest';
import type { ParsedProductImportRow } from '@/lib/product-import-parser';
import { normalizeImportKey } from '@/lib/product-import-parser';
import { planProductImportRows, type ExistingImportProduct } from '@/lib/product-import-planner';

function row(
  rowNumber: number,
  displayName: string,
  overrides: Partial<ParsedProductImportRow> = {},
): ParsedProductImportRow {
  return {
    rowNumber,
    brand: '브랜드',
    productName: displayName.split(' / ')[0] ?? displayName,
    optionName: displayName.split(' / ')[1] ?? '단일',
    displayName,
    importKey: normalizeImportKey(displayName),
    price: 1000,
    managementCode: 'PRD',
    category: '잡화',
    barcode: 'BAR',
    memo: null,
    hasImage: false,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

describe('planProductImportRows', () => {
  it('marks unknown products as create', () => {
    const preview = planProductImportRows([row(2, '새 상품 / 단일')], []);

    expect(preview.summary).toMatchObject({ total: 1, create: 1, update: 0, error: 0 });
    expect(preview.rows[0]).toMatchObject({
      action: 'create',
      existingProductId: null,
    });
  });

  it('updates by import_key before exact name matching', () => {
    const existing: ExistingImportProduct[] = [
      {
        id: 'p1',
        name: '과거 상품명',
        import_key: normalizeImportKey('상품 / 옵션'),
        stock: 7,
        is_active: true,
        per_user_limit: 2,
      },
      {
        id: 'p2',
        name: '상품 / 옵션',
        import_key: null,
      },
    ];

    const preview = planProductImportRows([row(2, '상품 / 옵션')], existing);

    expect(preview.rows[0]).toMatchObject({
      action: 'update',
      existingProductId: 'p1',
      existingProductName: '과거 상품명',
    });
    expect(preview.summary).toMatchObject({ create: 0, update: 1, error: 0 });
  });

  it('falls back to exact product name when import_key is not present', () => {
    const existing: ExistingImportProduct[] = [
      { id: 'p1', name: '상품 / 옵션', import_key: null },
    ];

    const preview = planProductImportRows([row(2, '상품 / 옵션')], existing);

    expect(preview.rows[0]).toMatchObject({
      action: 'update',
      existingProductId: 'p1',
    });
  });

  it('blocks ambiguous exact-name matches', () => {
    const existing: ExistingImportProduct[] = [
      { id: 'p1', name: '상품 / 옵션', import_key: null },
      { id: 'p2', name: '상품 / 옵션', import_key: null },
    ];

    const preview = planProductImportRows([row(2, '상품 / 옵션')], existing);

    expect(preview.rows[0]!.action).toBe('error');
    expect(preview.rows[0]!.errors[0]).toContain('같은 상품명의 기존 상품이 여러 개');
    expect(preview.summary.error).toBe(1);
  });

  it('preserves parse errors and keeps the row unapplied', () => {
    const preview = planProductImportRows(
      [row(2, '상품 / 옵션', { errors: ['가격 오류'], price: null })],
      [],
    );

    expect(preview.rows[0]).toMatchObject({
      action: 'error',
      existingProductId: null,
      price: null,
    });
    expect(preview.summary).toMatchObject({ create: 0, update: 0, error: 1 });
  });
});
