import type { InboundStatus } from '@/lib/types';

export const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

const ALLOWED_TRANSITIONS: Record<InboundStatus, readonly InboundStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: InboundStatus, to: InboundStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isLocked(status: InboundStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export type EditRequestContext = {
  status: InboundStatus;
  isOwner: boolean;
  isAdmin: boolean;
};

export function canEditRequest({ status, isOwner, isAdmin }: EditRequestContext): boolean {
  if (isAdmin) return true;
  return isOwner && status === 'open';
}

export type EditCommentContext = {
  createdAt: Date;
  isAuthor: boolean;
  isAdmin: boolean;
  now?: Date;
};

export function canEditComment({
  createdAt,
  isAuthor,
  isAdmin,
  now = new Date(),
}: EditCommentContext): boolean {
  if (isAdmin) return true;
  if (!isAuthor) return false;
  return now.getTime() - createdAt.getTime() < COMMENT_EDIT_WINDOW_MS;
}
