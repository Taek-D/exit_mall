export function mapShippingUploadError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자만 처리할 수 있습니다.';
  if (message.startsWith('NOT_FOUND')) return '업로드를 찾을 수 없습니다.';
  if (message.startsWith('ALREADY_PROCESSED')) return '이미 처리된 업로드입니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('USER_NOT_ACTIVE')) return '사용자 계정이 활성 상태가 아닙니다.';
  if (message.startsWith('EMPTY_ITEMS')) return '주문 항목이 없습니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량 값이 올바르지 않은 항목이 있습니다.';
  if (message.startsWith('INSUFFICIENT_INVENTORY')) {
    const parts = message.split(':');
    const need = parts[2] ?? '?';
    const have = parts[3] ?? '?';
    return `보유 재고가 부족합니다 (필요 ${need}개, 보유 ${have}개).`;
  }
  if (message.startsWith('INSUFFICIENT_BALANCE')) return '고객의 가용 예치금이 부족합니다.';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return '존재하지 않는 상품명이 있습니다.';
  if (message.startsWith('ROW_COUNT_MISMATCH')) {
    const parts = message.split(':');
    return `원본과 행 수가 다릅니다 (원본 ${parts[1]}행, 새 파일 ${parts[2]}행).`;
  }
  if (message.startsWith('INVALID_STATE')) {
    const cur = message.split(':')[1] ?? '?';
    return `현재 상태에서는 처리할 수 없습니다 (${cur}).`;
  }
  if (message.startsWith('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.startsWith('LEGACY_ITEMS_NOT_SUPPORTED')) {
    return '구 양식(주문서 업로드)으로 등록된 행이라 새 흐름에서 처리할 수 없습니다. 반려 후 고객에게 새 양식 재업로드를 안내해주세요.';
  }
  if (message.startsWith('FEE_TAMPERED')) {
    const parts = message.split(':');
    return `배송비가 행수×₩3,300 과 다릅니다 (예상 ${parts[1]}, 저장값 ${parts[2]}). 반려 후 다시 업로드 받아주세요.`;
  }
  if (message.startsWith('PRODUCT_MISMATCH')) {
    const parts = message.split(':');
    return `상품 ID 와 상품명이 일치하지 않는 행이 있습니다 (입력 상품명 ${parts[2]}, 실제 상품명 ${parts[3] ?? '?'}). 반려 후 새 양식으로 다시 업로드 받아주세요.`;
  }
  return '처리 중 오류가 발생했습니다.';
}
