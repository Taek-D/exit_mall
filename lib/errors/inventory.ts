/**
 * adjust_user_inventory RPC 에러 매퍼.
 *
 * 관리자가 사용자 재고를 가/감산할 때의 에러 메시지 변환을 담당한다.
 * NEGATIVE_INVENTORY는 RPC가 현재 재고와 적용하려는 변화량을 콜론 구분으로
 * 함께 반환하므로 매퍼가 분해하여 사용자 친화 메시지를 만든다.
 */

export function mapInventoryAdjustError(message: string): string | null {
  if (message.startsWith('FORBIDDEN')) return '권한이 없습니다.';
  if (message.startsWith('ZERO_DELTA')) return '0이 아닌 값을 입력해주세요.';
  if (message.startsWith('NEGATIVE_INVENTORY')) {
    const parts = message.split(':');
    return `잔여 재고가 부족합니다 (현재 ${parts[1]}, 적용하려는 변화 ${parts[2]}).`;
  }
  return null;
}
