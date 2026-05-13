import { describe, it, expect } from 'vitest';
import { mapCustomInventoryError } from '@/lib/errors/custom-inventory';

describe('mapCustomInventoryError', () => {
  it('FORBIDDEN', () => {
    expect(mapCustomInventoryError('FORBIDDEN')).toBe('관리자 권한이 필요합니다.');
  });
  it('INVALID_NAME', () => {
    expect(mapCustomInventoryError('INVALID_NAME')).toContain('상품명');
  });
  it('INVALID_QUANTITY', () => {
    expect(mapCustomInventoryError('INVALID_QUANTITY')).toContain('수량');
  });
  it('ZERO_DELTA', () => {
    expect(mapCustomInventoryError('ZERO_DELTA')).toContain('0이 아닌');
  });
  it('DUPLICATE_NAME', () => {
    expect(mapCustomInventoryError('DUPLICATE_NAME')).toContain('이미');
  });
  it('NEGATIVE_INVENTORY parses current/delta', () => {
    const r = mapCustomInventoryError('NEGATIVE_INVENTORY:5:-7');
    expect(r).toContain('5');
    expect(r).toContain('-7');
  });
  it('NOT_FOUND', () => {
    expect(mapCustomInventoryError('NOT_FOUND')).toContain('찾을 수 없');
  });
  it('unknown fallback', () => {
    expect(mapCustomInventoryError('XXX')).toBe('처리 중 오류가 발생했습니다.');
  });
});
