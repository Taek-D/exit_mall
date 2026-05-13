export function mapCustomInventoryError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자 권한이 필요합니다.';
  if (message.startsWith('INVALID_NAME')) {
    return '상품명을 1–100자 사이로 입력해주세요.';
  }
  if (message.startsWith('INVALID_QUANTITY')) {
    return '수량은 0 이상의 정수여야 합니다.';
  }
  if (message.startsWith('ZERO_DELTA')) return '0이 아닌 값을 입력해주세요.';
  if (message.startsWith('DUPLICATE_NAME')) {
    return '같은 이름의 수기 항목이 이미 있습니다.';
  }
  if (message.startsWith('NEGATIVE_INVENTORY')) {
    const parts = message.split(':');
    return `잔여 재고가 부족합니다 (현재 ${parts[1]}, 적용하려는 변화 ${parts[2]}).`;
  }
  if (message.startsWith('NOT_FOUND')) return '항목을 찾을 수 없습니다.';
  return '처리 중 오류가 발생했습니다.';
}
