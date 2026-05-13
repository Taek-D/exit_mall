import { canEditComment } from '@/lib/inbound/permissions';

export function getInboundCommentAccessError({
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
    !canEditComment({
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
