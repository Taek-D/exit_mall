import { describe, expect, it } from 'vitest';
import { getInboundCommentAccessError } from '@/lib/inbound/comment-access';

const now = new Date('2026-05-14T00:00:00Z');

describe('getInboundCommentAccessError', () => {
  it('requires authorship or admin role', () => {
    expect(
      getInboundCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u2',
        createdAt: '2026-05-13T23:59:00Z',
        isAdmin: false,
        now,
      }),
    ).toBe('권한이 없습니다.');
  });

  it('blocks non-admin authors after the edit window', () => {
    expect(
      getInboundCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-13T23:49:00Z',
        isAdmin: false,
        now,
      }),
    ).toBe('댓글 수정 가능 시간이 지났습니다 (10분).');
  });

  it('allows admins and authors inside the edit window', () => {
    expect(
      getInboundCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u2',
        createdAt: '2026-01-01T00:00:00Z',
        isAdmin: true,
        now,
      }),
    ).toBeNull();

    expect(
      getInboundCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-13T23:59:00Z',
        isAdmin: false,
        now,
      }),
    ).toBeNull();
  });
});
