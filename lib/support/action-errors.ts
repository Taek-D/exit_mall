export function mapSubmitSupportRequestError(message: string): string | null {
  if (message.includes('RATE_LIMITED')) return '잠시 후 다시 시도해주세요 (분당 5건 제한).';
  if (message.includes('INVALID_CATEGORY')) return '문의 유형을 확인해주세요.';
  if (message.includes('INVALID_REFERENCE_TYPE')) return '참고번호 유형을 확인해주세요.';
  if (message.includes('INVALID_BODY')) return '문의 내용을 확인해주세요.';
  return null;
}

export function mapSupportCancelError(message: string): string | null {
  if (message.includes('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  return null;
}

export function mapSupportStatusError(message: string): string | null {
  if (message.includes('FORBIDDEN')) return '관리자만 변경할 수 있습니다.';
  if (message.includes('INVALID_TRANSITION')) return '허용되지 않은 상태 전이입니다.';
  return null;
}

export function mapSupportCommentError(message: string): string | null {
  if (message.includes('LOCKED')) return '이미 종결되어 댓글을 작성할 수 없습니다.';
  if (message.includes('INVALID_BODY')) return '댓글 내용을 확인해주세요.';
  if (message.includes('RATE_LIMITED')) return '잠시 후 다시 시도해주세요 (분당 20건 제한).';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  return null;
}
