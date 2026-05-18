import { Shield, User as UserIcon } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import type { SupportCommentRow } from '@/lib/support/queries';
import { cn } from '@/lib/utils';
import { CommentRowActions } from './SupportCommentForm';

type Props = {
  comments: SupportCommentRow[];
  currentUserId: string;
  isAdmin: boolean;
  locked?: boolean;
};

export function SupportCommentList({ comments, currentUserId, isAdmin, locked = false }: Props) {
  if (comments.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">아직 댓글이 없습니다.</p>;
  }

  return (
    <ul className="space-y-4">
      {comments.map((comment) => {
        const isAuthor = comment.author_id === currentUserId;
        const isAdminAuthor = comment.author_role === 'admin';

        return (
          <li key={comment.id} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                isAdminAuthor ? 'bg-accent/15 text-accent' : 'bg-muted text-foreground',
              )}
              aria-hidden
            >
              {isAdminAuthor ? (
                <Shield className="h-3.5 w-3.5" />
              ) : (
                <UserIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isAdminAuthor ? '관리자' : '작성자'}
                </span>
                <span>{formatShortDateTimeKR(comment.created_at)}</span>
                {comment.updated_at !== comment.created_at && <span>(수정됨)</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              {!locked && (
                <CommentRowActions
                  commentId={comment.id}
                  createdAt={comment.created_at}
                  isAuthor={isAuthor}
                  isAdmin={isAdmin}
                  body={comment.body}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
