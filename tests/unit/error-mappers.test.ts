/**
 * Phase 1.4에서 신설된 5개 도메인 에러 매퍼의 단위 테스트.
 *
 * 매퍼는 RPC가 반환한 에러 메시지(코드 prefix 포함 가능)를 받아 사용자 친화
 * 한국어 메시지로 변환한다. 매칭되지 않는 메시지는 null을 반환해 호출처가
 * fall-through 처리하도록 한다 (mapAuthLoginError는 보안상 항상 동일 메시지 반환).
 */
import { describe, expect, it } from 'vitest';
import { mapPlaceOrderError } from '@/lib/errors/place-order';
import { mapOrderUploadError } from '@/lib/errors/order-upload';
import { mapInventoryAdjustError } from '@/lib/errors/inventory';
import { mapAdjustBalanceError } from '@/lib/errors/balance';
import { mapAuthLoginError, mapPasswordChangeError } from '@/lib/errors/auth';

describe('mapPlaceOrderError', () => {
  it('INSUFFICIENT_BALANCE를 한국어 메시지로 변환한다', () => {
    expect(mapPlaceOrderError('INSUFFICIENT_BALANCE')).toBe('예치금이 부족합니다');
  });

  it('OUT_OF_STOCK를 한국어 메시지로 변환한다 (productId 포함 메시지도 매칭)', () => {
    expect(mapPlaceOrderError('OUT_OF_STOCK:abc-product')).toBe('재고가 부족합니다');
  });

  it('PRODUCT_INACTIVE를 한국어 메시지로 변환한다', () => {
    expect(mapPlaceOrderError('PRODUCT_INACTIVE:abc-product')).toBe('판매 중지된 상품이 있습니다');
  });

  it('NOT_ACTIVE를 한국어 메시지로 변환한다', () => {
    expect(mapPlaceOrderError('NOT_ACTIVE')).toBe('계정이 활성 상태가 아닙니다');
  });

  it('PER_USER_LIMIT_EXCEEDED는 null을 반환한다 (호출처가 limit/already 부가 처리)', () => {
    expect(mapPlaceOrderError('PER_USER_LIMIT_EXCEEDED:abc:5:3')).toBeNull();
  });

  it('알 수 없는 메시지는 null을 반환한다', () => {
    expect(mapPlaceOrderError('UNKNOWN_ERROR')).toBeNull();
    expect(mapPlaceOrderError('')).toBeNull();
  });
});

describe('mapOrderUploadError', () => {
  it.each([
    ['FORBIDDEN', '관리자만 승인할 수 있습니다.'],
    ['NOT_FOUND', '업로드를 찾을 수 없습니다.'],
    ['ALREADY_PROCESSED', '이미 처리된 업로드입니다.'],
    ['MISSING_SHIPPING', '배송 정보(받는 사람·연락처·주소)가 비어있습니다.'],
    ['USER_NOT_ACTIVE', '고객 계정이 활성 상태가 아닙니다.'],
    ['INSUFFICIENT_BALANCE', '고객의 예치금이 부족합니다.'],
    ['EMPTY_ITEMS', '주문 항목이 없습니다.'],
    ['INVALID_QUANTITY', '수량 값이 올바르지 않은 항목이 있습니다.'],
    ['INVALID_PRICE', '단가 값이 올바르지 않은 항목이 있습니다.'],
  ])('%s → "%s"', (input, expected) => {
    expect(mapOrderUploadError(input)).toBe(expected);
  });

  it('매칭되지 않는 메시지는 null을 반환한다', () => {
    expect(mapOrderUploadError('SOMETHING_ELSE')).toBeNull();
    expect(mapOrderUploadError('')).toBeNull();
  });
});

describe('mapInventoryAdjustError', () => {
  it('FORBIDDEN을 한국어 메시지로 변환한다', () => {
    expect(mapInventoryAdjustError('FORBIDDEN')).toBe('권한이 없습니다.');
  });

  it('ZERO_DELTA를 한국어 메시지로 변환한다', () => {
    expect(mapInventoryAdjustError('ZERO_DELTA')).toBe('0이 아닌 값을 입력해주세요.');
  });

  it('NEGATIVE_INVENTORY는 현재/변화량을 파싱하여 메시지에 포함시킨다', () => {
    expect(mapInventoryAdjustError('NEGATIVE_INVENTORY:5:-7')).toBe(
      '잔여 재고가 부족합니다 (현재 5, 적용하려는 변화 -7).',
    );
  });

  it('startsWith로 검사하므로 prefix가 다른 메시지는 null', () => {
    expect(mapInventoryAdjustError('OTHER_FORBIDDEN')).toBeNull();
    expect(mapInventoryAdjustError('')).toBeNull();
  });
});

describe('mapAdjustBalanceError', () => {
  it('NEGATIVE_BALANCE를 변환한다', () => {
    expect(mapAdjustBalanceError('NEGATIVE_BALANCE')).toBe('잔액이 음수가 됩니다');
  });

  it('NEGATIVE_BALANCE를 포함한 더 긴 메시지도 매칭한다', () => {
    expect(mapAdjustBalanceError('FOO_NEGATIVE_BALANCE_BAR')).toBe('잔액이 음수가 됩니다');
  });

  it('매칭되지 않는 메시지는 null을 반환한다', () => {
    expect(mapAdjustBalanceError('FORBIDDEN')).toBeNull();
    expect(mapAdjustBalanceError('')).toBeNull();
  });
});

describe('mapAuthLoginError', () => {
  it('어떤 메시지든 동일한 사용자 친화 메시지를 반환한다 (Enumeration 방지)', () => {
    expect(mapAuthLoginError('Invalid login credentials')).toBe(
      '로그인 실패: 이메일 또는 비밀번호가 틀립니다',
    );
    expect(mapAuthLoginError('User not found')).toBe(
      '로그인 실패: 이메일 또는 비밀번호가 틀립니다',
    );
    expect(mapAuthLoginError('')).toBe('로그인 실패: 이메일 또는 비밀번호가 틀립니다');
  });
});

describe('mapPasswordChangeError', () => {
  it('Invalid를 포함하는 메시지는 비밀번호 안내로 변환한다', () => {
    expect(mapPasswordChangeError('Invalid login credentials')).toBe(
      '현재 비밀번호가 올바르지 않습니다',
    );
  });

  it('매칭되지 않는 메시지는 null을 반환한다', () => {
    expect(mapPasswordChangeError('Network error')).toBeNull();
    expect(mapPasswordChangeError('')).toBeNull();
  });
});
