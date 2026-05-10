import { describe, it, expect } from 'vitest';
import { mapShippingUploadError } from '@/lib/errors/shipping-upload';

describe('mapShippingUploadError', () => {
  it('FORBIDDEN', () => {
    expect(mapShippingUploadError('FORBIDDEN')).toBe('관리자만 처리할 수 있습니다.');
  });
  it('NOT_FOUND', () => {
    expect(mapShippingUploadError('NOT_FOUND')).toBe('업로드를 찾을 수 없습니다.');
  });
  it('ALREADY_PROCESSED', () => {
    expect(mapShippingUploadError('ALREADY_PROCESSED')).toBe('이미 처리된 업로드입니다.');
  });
  it('USER_NOT_ACTIVE', () => {
    expect(mapShippingUploadError('USER_NOT_ACTIVE')).toContain('활성');
  });
  it('EMPTY_ITEMS', () => {
    expect(mapShippingUploadError('EMPTY_ITEMS')).toContain('주문 항목이 없');
  });
  it('INSUFFICIENT_INVENTORY', () => {
    const r = mapShippingUploadError('INSUFFICIENT_INVENTORY:abc:10:3');
    expect(r).toContain('보유 재고');
    expect(r).toContain('10');
    expect(r).toContain('3');
  });
  it('INSUFFICIENT_BALANCE', () => {
    expect(mapShippingUploadError('INSUFFICIENT_BALANCE')).toContain('예치금');
  });
  it('PRODUCT_NOT_FOUND', () => {
    expect(mapShippingUploadError('PRODUCT_NOT_FOUND:스니커즈')).toContain('존재하지 않는 상품명');
  });
  it('ROW_COUNT_MISMATCH', () => {
    const r = mapShippingUploadError('ROW_COUNT_MISMATCH:5:3');
    expect(r).toContain('행 수가 다릅');
  });
  it('INVALID_STATE', () => {
    expect(mapShippingUploadError('INVALID_STATE:pending')).toContain('현재 상태');
  });
  it('INVALID_QUANTITY', () => {
    expect(mapShippingUploadError('INVALID_QUANTITY')).toContain('수량');
  });
  it('NOT_CANCELLABLE', () => {
    expect(mapShippingUploadError('NOT_CANCELLABLE')).toContain('취소할 수 없');
  });
  it('unknown fallback', () => {
    expect(mapShippingUploadError('XXX')).toBe('처리 중 오류가 발생했습니다.');
  });
});
