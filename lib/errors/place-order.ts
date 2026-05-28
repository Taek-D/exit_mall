/**
 * place_order RPC 에러 매퍼.
 *
 * 일반 주문(checkout) 도메인 전용. 관리자 발주(stock-order)는 stock-order.ts
 * 매퍼를 사용한다. 두 도메인은 INSUFFICIENT_BALANCE/OUT_OF_STOCK/PRODUCT_INACTIVE
 * /PER_USER_LIMIT_EXCEEDED/NOT_ACTIVE 5개 에러 코드를 공유하지만, 메시지 톤과
 * UI 노출 위치가 달라 분리 유지한다.
 *
 * 일부 에러는 productId/limit/already 같은 부가 정보를 함께 노출해야 하므로
 * 호출처에서 message.split(':')으로 후속 처리한다. 본 매퍼는 기본 메시지만
 * 반환하고, 부가 정보가 필요한 코드는 null을 반환해 호출처가 fall-through
 * 처리하도록 한다.
 */

export type PlaceOrderErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'OUT_OF_STOCK'
  | 'PRODUCT_INACTIVE'
  | 'PER_USER_LIMIT_EXCEEDED'
  | 'NOT_ACTIVE';

export function mapPlaceOrderError(message: string): string | null {
  if (message.includes('INSUFFICIENT_BALANCE')) return '예치금이 부족합니다';
  if (message.includes('OUT_OF_STOCK')) return '재고가 부족합니다';
  if (message.includes('PRODUCT_INACTIVE')) return '판매 중지된 상품이 있습니다';
  if (message.includes('NOT_ACTIVE')) return '계정이 활성 상태가 아닙니다';
  // PER_USER_LIMIT_EXCEEDED는 호출처가 limit/already 부가 정보를 메시지에 합치므로
  // 여기서는 null을 반환해 fall-through 시킨다.
  return null;
}
