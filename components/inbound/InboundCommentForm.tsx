'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  addInboundCommentAction,
  updateInboundCommentAction,
  deleteInboundCommentAction,
} from '@/lib/actions/inbound-request';
import { COMMENT_EDIT_WINDOW_MS } from '@/lib/inbound/permissions';

export function InboundCommentForm({
  requestId,
  disabled,
  disabledReason,
}: {
  requestId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  if (disabled) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        {disabledReason ?? '댓글을 작성할 수 없습니다.'}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!trimmed) return;
        start(async () => {
          setError(null);
          const r = await addInboundCommentAction(requestId, trimmed);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setBody('');
          toast({ title: '댓글이 등록되었습니다.' });
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="댓글 입력 (최대 2000자)"
        className="w-full rounded-md border bg-background p-3 text-sm resize-y"
        aria-label="댓글 입력"
      />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? '등록 중…' : '댓글 등록'}
        </Button>
      </div>
    </form>
  );
}

export function CommentRowActions({
  commentId,
  createdAt,
  isAuthor,
  isAdmin,
  body,
}: {
  commentId: string;
  createdAt: string;
  isAuthor: boolean;
  isAdmin: boolean;
  body: string;
}) {
  const created = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) return;
    if (!isAuthor) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [isAdmin, isAuthor]);

  const editable = isAdmin || (isAuthor && now - created < COMMENT_EDIT_WINDOW_MS);
  if (!editable) return null;

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          aria-label="댓글 수정"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || draft.trim().length === 0}
            onClick={() =>
              start(async () => {
                const r = await updateInboundCommentAction(commentId, draft.trim());
                if (!r.ok) {
                  toast({ title: '수정 실패', description: r.error, variant: 'destructive' });
                  return;
                }
                setEditing(false);
                toast({ title: '수정되었습니다.' });
                router.refresh();
              })
            }
          >
            저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setDraft(body);
            }}
          >
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
      <button type="button" className="hover:underline" onClick={() => setEditing(true)}>
        수정
      </button>
      <button
        type="button"
        className="hover:underline text-destructive"
        onClick={() =>
          start(async () => {
            if (!confirm('이 댓글을 삭제할까요?')) return;
            const r = await deleteInboundCommentAction(commentId);
            if (!r.ok) {
              toast({ title: '삭제 실패', description: r.error, variant: 'destructive' });
              return;
            }
            toast({ title: '삭제되었습니다.' });
            router.refresh();
          })
        }
      >
        삭제
      </button>
    </div>
  );
}
