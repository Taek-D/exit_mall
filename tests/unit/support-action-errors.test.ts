import { describe, expect, it } from 'vitest';
import {
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
  mapSubmitSupportRequestError,
} from '@/lib/support/action-errors';

describe('support action error mappers', () => {
  it('maps submit errors by exact RPC code token', () => {
    expect(mapSubmitSupportRequestError('RATE_LIMITED')).toBe('잠시 후 다시 시도해주세요 (분당 5건 제한).');
    expect(mapSubmitSupportRequestError('INVALID_CATEGORY')).toBe('문의 유형을 확인해주세요.');
    expect(mapSubmitSupportRequestError('INVALID_REFERENCE_TYPE')).toBe('참고번호 유형을 확인해주세요.');
    expect(mapSubmitSupportRequestError('INVALID_BODY: title missing')).toBe('문의 내용을 확인해주세요.');
  });

  it('maps cancel errors by exact RPC code token', () => {
    expect(mapSupportCancelError('NOT_CANCELLABLE')).toBe('취소할 수 없는 상태입니다.');
    expect(mapSupportCancelError('FORBIDDEN user mismatch')).toBe('권한이 없습니다.');
  });

  it('maps status errors by exact RPC code token', () => {
    expect(mapSupportStatusError('FORBIDDEN')).toBe('관리자만 변경할 수 있습니다.');
    expect(mapSupportStatusError('INVALID_TRANSITION: open to completed')).toBe('허용되지 않은 상태 전이입니다.');
  });

  it('maps comment errors by exact RPC code token', () => {
    expect(mapSupportCommentError('LOCKED')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapSupportCommentError('LOCKED: request completed')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapSupportCommentError('LOCKED request completed')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapSupportCommentError('INVALID_BODY')).toBe('댓글 내용을 확인해주세요.');
    expect(mapSupportCommentError('RATE_LIMITED')).toBe('잠시 후 다시 시도해주세요 (분당 20건 제한).');
    expect(mapSupportCommentError('FORBIDDEN')).toBe('권한이 없습니다.');
  });

  it('returns null for unknown messages in every mapper', () => {
    expect(mapSubmitSupportRequestError('UNKNOWN')).toBeNull();
    expect(mapSupportCancelError('UNKNOWN')).toBeNull();
    expect(mapSupportStatusError('UNKNOWN')).toBeNull();
    expect(mapSupportCommentError('UNKNOWN')).toBeNull();
  });

  it('does not map substring lookalikes as known error codes', () => {
    expect(mapSupportCommentError('UNLOCKED')).toBeNull();
    expect(mapSupportCommentError('NOT_LOCKED')).toBeNull();
    expect(mapSupportCommentError('NOT_FORBIDDEN')).toBeNull();
    expect(mapSupportCancelError('NOT_FORBIDDEN')).toBeNull();
    expect(mapSupportStatusError('NOT_FORBIDDEN')).toBeNull();
  });
});
