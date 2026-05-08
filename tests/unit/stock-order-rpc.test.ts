import { describe, it, expect } from 'vitest';
import { mapStockOrderError } from '@/lib/actions/stock-order';

describe('mapStockOrderError', () => {
  it('UNAUTHORIZED', () => {
    expect(mapStockOrderError('UNAUTHORIZED')).toBe('로그인이 필요합니다.');
  });
  it('NOT_ACTIVE', () => {
    expect(mapStockOrderError('NOT_ACTIVE')).toBe('계정이 활성 상태가 아닙니다.');
  });
  it('EMPTY_CART', () => {
    expect(mapStockOrderError('EMPTY_CART')).toBe('장바구니가 비어있습니다.');
  });
  it('INSUFFICIENT_BALANCE', () => {
    expect(mapStockOrderError('INSUFFICIENT_BALANCE')).toBe('가용 예치금이 부족합니다.');
  });
  it('OUT_OF_STOCK with id', () => {
    const r = mapStockOrderError('OUT_OF_STOCK:abc-123');
    expect(r).toContain('재고가 부족');
  });
  it('PRODUCT_INACTIVE with id', () => {
    expect(mapStockOrderError('PRODUCT_INACTIVE:abc')).toContain('판매 중지');
  });
  it('PRODUCT_NOT_FOUND with id', () => {
    expect(mapStockOrderError('PRODUCT_NOT_FOUND:abc')).toContain('존재하지 않는');
  });
  it('PER_USER_LIMIT_EXCEEDED:product_id:limit:already', () => {
    const r = mapStockOrderError('PER_USER_LIMIT_EXCEEDED:abc:5:3');
    expect(r).toContain('1인 구매 한도');
    expect(r).toContain('5');
    expect(r).toContain('3');
  });
  it('NOT_CANCELLABLE', () => {
    expect(mapStockOrderError('NOT_CANCELLABLE')).toContain('취소할 수 없');
  });
  it('FORBIDDEN', () => {
    expect(mapStockOrderError('FORBIDDEN')).toContain('권한');
  });
  it('NOT_FOUND', () => {
    expect(mapStockOrderError('NOT_FOUND')).toContain('찾을 수 없');
  });
  it('ALREADY_PROCESSED', () => {
    expect(mapStockOrderError('ALREADY_PROCESSED')).toContain('이미');
  });
  it('unknown error fallback', () => {
    expect(mapStockOrderError('SOME_RANDOM_ERROR')).toBe('처리 중 오류가 발생했습니다.');
  });
});
