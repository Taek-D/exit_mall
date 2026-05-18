import type { SupportStatus } from '@/lib/types';

export const SUPPORT_COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

const SUPPORT_TRANSITIONS: Record<SupportStatus, readonly SupportStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionSupportStatus(from: SupportStatus, to: SupportStatus): boolean {
  return SUPPORT_TRANSITIONS[from].includes(to);
}

export function isSupportLocked(status: SupportStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function canCancelSupportRequest({
  status,
  isOwner,
  isAdmin,
}: {
  status: SupportStatus;
  isOwner: boolean;
  isAdmin: boolean;
}): boolean {
  if (isAdmin) return status === 'open' || status === 'in_progress';
  return isOwner && status === 'open';
}

export function canEditSupportComment({
  createdAt,
  isAuthor,
  isAdmin,
  now = new Date(),
}: {
  createdAt: Date;
  isAuthor: boolean;
  isAdmin: boolean;
  now?: Date;
}): boolean {
  if (isAdmin) return true;
  if (!isAuthor) return false;
  return now.getTime() - createdAt.getTime() < SUPPORT_COMMENT_EDIT_WINDOW_MS;
}

export function getSupportCommentAccessError({
  authorId,
  currentUserId,
  createdAt,
  isAdmin,
  now = new Date(),
  action = '수정',
}: {
  authorId: string;
  currentUserId: string;
  createdAt: string;
  isAdmin: boolean;
  now?: Date;
  action?: '수정' | '삭제';
}): string | null {
  const isAuthor = authorId === currentUserId;
  if (!isAdmin && !isAuthor) return '권한이 없습니다.';
  if (
    !canEditSupportComment({
      createdAt: new Date(createdAt),
      isAuthor,
      isAdmin,
      now,
    })
  ) {
    return `댓글 ${action} 가능 시간이 지났습니다 (10분).`;
  }
  return null;
}
