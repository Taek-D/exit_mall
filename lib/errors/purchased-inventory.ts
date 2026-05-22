const FALLBACK_MESSAGE = '처리 중 오류가 발생했습니다.';

export function mapPurchasedInventoryError(message: string): string {
  if (message.startsWith('RESERVED_QUANTITY_EXCEEDED')) {
    const [, remaining = '?', reserved = '?'] = message.split(':');
    return `현재 예약 ${reserved}개가 있어 남은 수량을 ${remaining}개로 줄일 수 없습니다.`;
  }

  if (message.startsWith('RESERVED_IDENTITY_LOCKED')) {
    const [, reserved = '?'] = message.split(':');
    return `검토대기 배송대행에 ${reserved}개가 예약되어 있어 상품명/옵션을 변경할 수 없습니다.`;
  }

  if (message.startsWith('FORBIDDEN')) return '관리자만 처리할 수 있습니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('LOT_NOT_FOUND') || message.startsWith('NOT_FOUND')) {
    return '사입재고를 찾을 수 없습니다.';
  }
  if (message.startsWith('INVALID_PRODUCT_NAME') || message.startsWith('INVALID_NAME')) {
    return '상품명은 1자 이상 100자 이하여야 합니다.';
  }
  if (message.startsWith('INVALID_QUANTITY')) return '수량은 0 이상이어야 합니다.';
  if (message.startsWith('INVALID_MEMO')) return '메모는 200자 이하여야 합니다.';

  return FALLBACK_MESSAGE;
}
