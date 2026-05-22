import { describe, expect, it } from 'vitest';
import { mapPurchasedInventoryError } from '@/lib/errors/purchased-inventory';

describe('mapPurchasedInventoryError', () => {
  it('maps RESERVED_QUANTITY_EXCEEDED with remaining and reserved quantities', () => {
    expect(mapPurchasedInventoryError('RESERVED_QUANTITY_EXCEEDED:2:3')).toBe(
      '현재 예약 3개가 있어 남은 수량을 2개로 줄일 수 없습니다.',
    );
  });

  it('maps RESERVED_IDENTITY_LOCKED with reserved quantity', () => {
    expect(mapPurchasedInventoryError('RESERVED_IDENTITY_LOCKED:4')).toBe(
      '검토대기 배송대행에 4개가 예약되어 있어 상품명/옵션을 변경할 수 없습니다.',
    );
  });

  it.each([
    ['FORBIDDEN', '관리자만 처리할 수 있습니다.'],
    ['USER_NOT_FOUND', '사용자를 찾을 수 없습니다.'],
    ['LOT_NOT_FOUND', '사입재고를 찾을 수 없습니다.'],
    ['INVALID_PRODUCT_NAME', '상품명은 1자 이상 100자 이하여야 합니다.'],
    ['INVALID_QUANTITY', '수량은 0 이상이어야 합니다.'],
    ['INVALID_MEMO', '메모는 200자 이하여야 합니다.'],
  ])('maps %s', (code, expected) => {
    expect(mapPurchasedInventoryError(code)).toBe(expected);
  });

  it('keeps backward-compatible aliases', () => {
    expect(mapPurchasedInventoryError('NOT_FOUND')).toBe('사입재고를 찾을 수 없습니다.');
    expect(mapPurchasedInventoryError('INVALID_NAME')).toBe(
      '상품명은 1자 이상 100자 이하여야 합니다.',
    );
  });

  it('falls back for unknown errors', () => {
    expect(mapPurchasedInventoryError('UNKNOWN')).toBe('처리 중 오류가 발생했습니다.');
  });
});
