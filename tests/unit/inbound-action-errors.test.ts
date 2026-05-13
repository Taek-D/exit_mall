import { describe, expect, it } from 'vitest';
import {
  mapInboundCancelError,
  mapInboundCommentError,
  mapInboundStatusError,
  mapSubmitInboundRequestError,
} from '@/lib/inbound/action-errors';

describe('mapSubmitInboundRequestError', () => {
  it('maps known submit RPC errors', () => {
    expect(mapSubmitInboundRequestError('RATE_LIMITED', 3)).toBe(
      '잠시 후 다시 시도해주세요 (분당 5건 제한).',
    );
    expect(mapSubmitInboundRequestError('TOO_MANY_IMAGES', 3)).toBe(
      '이미지는 최대 3장까지 첨부할 수 있습니다.',
    );
    expect(mapSubmitInboundRequestError('UNKNOWN', 3)).toBeNull();
  });
});

describe('inbound action error mappers', () => {
  it('maps cancel errors', () => {
    expect(mapInboundCancelError('NOT_CANCELLABLE')).toBe('취소할 수 없는 상태입니다.');
    expect(mapInboundCancelError('NOPE')).toBeNull();
  });

  it('maps status errors', () => {
    expect(mapInboundStatusError('FORBIDDEN')).toBe('관리자만 변경할 수 있습니다.');
    expect(mapInboundStatusError('INVALID_TRANSITION')).toBe('허용되지 않은 상태 전이입니다.');
    expect(mapInboundStatusError('NOPE')).toBeNull();
  });

  it('maps comment errors', () => {
    expect(mapInboundCommentError('LOCKED')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapInboundCommentError('INVALID_BODY')).toBe('댓글 내용을 확인해주세요.');
    expect(mapInboundCommentError('NOPE')).toBeNull();
  });
});
