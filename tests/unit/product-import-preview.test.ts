import { describe, expect, it } from 'vitest';
import {
  getProductImportActionMeta,
  getProductImportStatusMeta,
  readProductImportPreview,
  readProductImportResult,
} from '@/lib/product-import-preview';
import type { Json } from '@/lib/db-types';

describe('readProductImportPreview', () => {
  it('returns null for invalid JSON shapes', () => {
    expect(readProductImportPreview(null)).toBeNull();
    expect(readProductImportPreview([])).toBeNull();
    expect(readProductImportPreview({ rows: [] } as unknown as Json)).toBeNull();
  });

  it('returns a preview when rows and summary are present', () => {
    const preview = {
      rows: [],
      summary: { total: 0, create: 0, update: 0, restore: 0, error: 0, warningRows: 0 },
    };

    expect(readProductImportPreview(preview as unknown as Json)).toBe(preview);
  });
});

describe('readProductImportResult', () => {
  it('normalizes missing counts and warning values', () => {
    expect(readProductImportResult({ warnings: ['a', 1] } as unknown as Json)).toEqual({
      created: 0,
      updated: 0,
      restored: 0,
      warnings: ['a', '1'],
    });
  });

  it('returns null for non-object values', () => {
    expect(readProductImportResult(null)).toBeNull();
    expect(readProductImportResult('done')).toBeNull();
  });
});

describe('product import meta', () => {
  it('maps row actions to labels and tones', () => {
    expect(getProductImportActionMeta('create')).toEqual({ label: '신규', tone: 'info' });
    expect(getProductImportActionMeta('update')).toEqual({ label: '덮어쓰기', tone: 'warning' });
    expect(getProductImportActionMeta('restore')).toEqual({ label: '복구', tone: 'success' });
    expect(getProductImportActionMeta('error')).toEqual({ label: '오류', tone: 'danger' });
  });

  it('maps import statuses to labels and tones', () => {
    expect(getProductImportStatusMeta('imported')).toEqual({
      label: '적용 완료',
      tone: 'success',
    });
    expect(getProductImportStatusMeta('failed')).toEqual({ label: '실패', tone: 'danger' });
    expect(getProductImportStatusMeta('preview')).toEqual({ label: '미리보기', tone: 'warning' });
  });
});
