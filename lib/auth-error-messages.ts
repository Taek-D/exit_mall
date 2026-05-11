export function formatSignupAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('email rate limit')) {
    return '가입 확인 이메일 발송 요청이 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.';
  }

  if (normalized.includes('already registered')) {
    return '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해주세요.';
  }

  return message;
}
