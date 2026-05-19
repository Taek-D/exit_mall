export function mapSubmitInboundRequestError(message: string, maxImages: number): string | null {
  if (message.includes('RATE_LIMITED')) return '잠시 후 다시 시도해주세요 (분당 5건 제한).';
  if (message.includes('INACTIVE')) return '계정이 활성 상태가 아닙니다.';
  if (message.includes('INVALID_TITLE') || message.includes('INVALID_BODY')) {
    return '입력 값을 확인해주세요.';
  }
  if (message.includes('TOO_MANY_IMAGES')) {
    return `이미지는 최대 ${maxImages}장까지 첨부할 수 있습니다.`;
  }
  if (message.includes('MISSING_EXCEL')) return '엑셀 파일이 누락되었습니다.';
  if (message.includes('EMPTY_INBOUND_ITEMS')) {
    return '입고 품목을 한 줄 이상 입력해주세요.';
  }
  if (message.includes('INVALID_INBOUND_PRODUCT')) {
    return '상품명을 확인해주세요 (1~100자).';
  }
  if (message.includes('INVALID_INBOUND_QUANTITY')) {
    return '재고수량은 1 이상이어야 합니다.';
  }
  if (message.includes('INVALID_INBOUND_ROW')) {
    return '입고 품목 행 번호가 유효하지 않습니다.';
  }
  return null;
}

export function mapInboundCancelError(message: string): string | null {
  if (message.includes('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.includes('ALREADY_CLOSED')) return '이미 종결된 요청입니다.';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  if (message.includes('NOT_FOUND')) return '요청을 찾을 수 없습니다.';
  return null;
}

export function mapInboundStatusError(message: string): string | null {
  if (message.includes('FORBIDDEN')) return '관리자만 변경할 수 있습니다.';
  if (message.includes('INVALID_TRANSITION')) return '허용되지 않은 상태 전이입니다.';
  if (message.includes('NOT_FOUND')) return '요청을 찾을 수 없습니다.';
  return null;
}

export function mapInboundCommentError(message: string): string | null {
  if (message.includes('LOCKED')) return '이미 종결되어 댓글을 작성할 수 없습니다.';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  if (message.includes('INACTIVE')) return '계정이 활성 상태가 아닙니다.';
  if (message.includes('INVALID_BODY')) return '댓글 내용을 확인해주세요.';
  if (message.includes('NOT_FOUND')) return '요청을 찾을 수 없습니다.';
  return null;
}
