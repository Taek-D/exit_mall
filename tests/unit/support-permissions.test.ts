import { describe, expect, it } from 'vitest';
import {
  canCancelSupportRequest,
  canEditSupportComment,
  getSupportCommentAccessError,
  canTransitionSupportStatus,
  isSupportLocked,
} from '@/lib/support/permissions';

describe('canTransitionSupportStatus', () => {
  it('allows the planned admin transitions', () => {
    expect(canTransitionSupportStatus('open', 'in_progress')).toBe(true);
    expect(canTransitionSupportStatus('open', 'cancelled')).toBe(true);
    expect(canTransitionSupportStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionSupportStatus('in_progress', 'cancelled')).toBe(true);
  });

  it('blocks skipped, same-state, and reopen transitions', () => {
    expect(canTransitionSupportStatus('open', 'completed')).toBe(false);
    expect(canTransitionSupportStatus('open', 'open')).toBe(false);
    expect(canTransitionSupportStatus('completed', 'in_progress')).toBe(false);
    expect(canTransitionSupportStatus('cancelled', 'open')).toBe(false);
  });
});

describe('isSupportLocked', () => {
  it('locks completed and cancelled only', () => {
    expect(isSupportLocked('open')).toBe(false);
    expect(isSupportLocked('in_progress')).toBe(false);
    expect(isSupportLocked('completed')).toBe(true);
    expect(isSupportLocked('cancelled')).toBe(true);
  });
});

describe('canCancelSupportRequest', () => {
  it('lets owners cancel only open requests', () => {
    expect(canCancelSupportRequest({ status: 'open', isOwner: true, isAdmin: false })).toBe(true);
    expect(canCancelSupportRequest({ status: 'in_progress', isOwner: true, isAdmin: false })).toBe(false);
  });

  it('lets admins cancel open and in_progress requests', () => {
    expect(canCancelSupportRequest({ status: 'open', isOwner: false, isAdmin: true })).toBe(true);
    expect(canCancelSupportRequest({ status: 'in_progress', isOwner: false, isAdmin: true })).toBe(true);
    expect(canCancelSupportRequest({ status: 'completed', isOwner: false, isAdmin: true })).toBe(false);
  });
});

describe('canEditSupportComment', () => {
  const now = new Date('2026-05-18T10:00:00Z');

  it('allows an author inside the 10 minute window', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2026-05-18T09:51:00Z'),
        isAuthor: true,
        isAdmin: false,
        now,
      }),
    ).toBe(true);
  });

  it('blocks an author at exactly 10 minutes', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2026-05-18T09:50:00Z'),
        isAuthor: true,
        isAdmin: false,
        now,
      }),
    ).toBe(false);
  });

  it('allows admins any time', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2024-01-01T00:00:00Z'),
        isAuthor: false,
        isAdmin: true,
        now,
      }),
    ).toBe(true);
  });
});

describe('getSupportCommentAccessError', () => {
  const now = new Date('2026-05-18T10:00:00Z');

  it('returns null when author is inside edit window', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-18T09:55:00Z',
        isAdmin: false,
        now,
        action: '수정',
      }),
    ).toBeNull();
  });

  it('returns a time-window message for expired author comments', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-18T09:49:59Z',
        isAdmin: false,
        now,
        action: '삭제',
      }),
    ).toBe('댓글 삭제 가능 시간이 지났습니다 (10분).');
  });

  it('returns forbidden for non-author non-admin users', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u2',
        createdAt: '2026-05-18T09:59:00Z',
        isAdmin: false,
        now,
      }),
    ).toBe('권한이 없습니다.');
  });
});
