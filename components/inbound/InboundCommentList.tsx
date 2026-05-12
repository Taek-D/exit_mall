import { Shield, User as UserIcon } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { InboundCommentRow } from '@/lib/inbound/queries';
import { CommentRowActions } from './InboundCommentForm';

type Props = {
  comments: InboundCommentRow[];
  currentUserId: string;
  isAdmin: boolean;
};

export function InboundCommentList({ comments, currentUserId, isAdmin }: Props) {
  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">아직 댓글이 없습니다.</p>;
  }
  return (
    <ul className="space-y-4">
      {comments.map((c) => {
        const isAuthor = c.author_id === currentUserId;
        const isAdminAuthor = c.author_role === 'admin';
        return (
          <li key={c.id} className="flex gap-3">
            <span
              className={cn(
                'h-7 w-7 rounded-full grid place-items-center shrink-0 mt-0.5',
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isAdminAuthor ? '관리자' : '작성자'}
                </span>
                <span>{formatShortDateTimeKR(c.created_at)}</span>
                {c.updated_at !== c.created_at && <span>(수정됨)</span>}
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
              <CommentRowActions
                commentId={c.id}
                createdAt={c.created_at}
                isAuthor={isAuthor}
                isAdmin={isAdmin}
                body={c.body}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
