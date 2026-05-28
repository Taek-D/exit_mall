/**
 * adjust_balance RPC 에러 매퍼.
 *
 * 관리자가 사용자 예치금을 조정할 때 발생할 수 있는 RPC 에러를 변환한다.
 */

export function mapAdjustBalanceError(message: string): string | null {
  if (message.includes('NEGATIVE_BALANCE')) return '잔액이 음수가 됩니다';
  return null;
}
