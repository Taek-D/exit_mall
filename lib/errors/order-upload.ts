/**
 * approve_order_upload / reject_order_upload RPC 에러 매퍼.
 *
 * 관리자 주문 업로드 승인 흐름 전용.
 */

export function mapOrderUploadError(message: string): string | null {
  if (message.includes('FORBIDDEN')) return '관리자만 승인할 수 있습니다.';
  if (message.includes('NOT_FOUND')) return '업로드를 찾을 수 없습니다.';
  if (message.includes('ALREADY_PROCESSED')) return '이미 처리된 업로드입니다.';
  if (message.includes('MISSING_SHIPPING')) {
    return '배송 정보(받는 사람·연락처·주소)가 비어있습니다.';
  }
  if (message.includes('USER_NOT_ACTIVE')) return '고객 계정이 활성 상태가 아닙니다.';
  if (message.includes('INSUFFICIENT_BALANCE')) return '고객의 예치금이 부족합니다.';
  if (message.includes('EMPTY_ITEMS')) return '주문 항목이 없습니다.';
  if (message.includes('INVALID_QUANTITY')) return '수량 값이 올바르지 않은 항목이 있습니다.';
  if (message.includes('INVALID_PRICE')) return '단가 값이 올바르지 않은 항목이 있습니다.';
  return null;
}
