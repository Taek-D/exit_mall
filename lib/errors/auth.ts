/**
 * 인증 흐름 에러 매퍼.
 *
 * supabase.auth.signInWithPassword 등이 반환하는 에러를 사용자 친화 메시지로
 * 변환한다. 로그인 실패의 경우 보안 상 이메일 존재 여부를 노출하지 않도록
 * 일관된 메시지를 반환한다.
 */

export function mapAuthLoginError(_message?: string): string {
  // 어떤 인증 실패든 동일 메시지로 처리 (Enumeration 방지).
  // 인자는 향후 메시지 분기 정책 대비로 시그니처에 남겨두되 현재는 사용하지 않는다.
  return '로그인 실패: 이메일 또는 비밀번호가 틀립니다';
}

export function mapPasswordChangeError(message: string): string | null {
  if (message.includes('Invalid')) return '현재 비밀번호가 올바르지 않습니다';
  return null;
}
