import { describe, expect, it } from 'vitest';
import {
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
  mapSubmitSupportRequestError,
} from '@/lib/support/action-errors';

describe('support action error mappers', () => {
  it('maps submit errors', () => {
    expect(mapSubmitSupportRequestError('RATE_LIMITED')).toBe('잠시 후 다시 시도해주세요 (분당 5건 제한).');
    expect(mapSubmitSupportRequestError('INVALID_CATEGORY')).toBe('문의 유형을 확인해주세요.');
    expect(mapSubmitSupportRequestError('UNKNOWN')).toBeNull();
  });

  it('maps cancel errors', () => {
    expect(mapSupportCancelError('NOT_CANCELLABLE')).toBe('취소할 수 없는 상태입니다.');
    expect(mapSupportCancelError('FORBIDDEN')).toBe('권한이 없습니다.');
  });

  it('maps status errors', () => {
    expect(mapSupportStatusError('FORBIDDEN')).toBe('관리자만 변경할 수 있습니다.');
    expect(mapSupportStatusError('INVALID_TRANSITION')).toBe('허용되지 않은 상태 전이입니다.');
  });

  it('maps comment errors', () => {
    expect(mapSupportCommentError('LOCKED')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapSupportCommentError('INVALID_BODY')).toBe('댓글 내용을 확인해주세요.');
  });
});
