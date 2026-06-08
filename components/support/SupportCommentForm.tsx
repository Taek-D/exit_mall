'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  addSupportCommentAction,
  deleteSupportCommentAction,
  updateSupportCommentAction,
} from '@/lib/actions/support-request';
import { SUPPORT_COMMENT_EDIT_WINDOW_MS } from '@/lib/support/permissions';
import type { SupportCommentImageRow } from '@/lib/support/queries';

const COMMENT_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp';

export function SupportCommentForm({
  requestId,
  disabled,
  disabledReason,
  allowImage = false,
}: {
  requestId: string;
  disabled: boolean;
  disabledReason?: string;
  allowImage?: boolean;
}) {
  const [body, setBody] = useState('');
  const [imageName, setImageName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const canSubmit = body.trim().length > 0 || Boolean(imageName);

  if (disabled) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        {disabledReason ?? '댓글을 작성할 수 없습니다.'}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = body.trim();
        if ((!trimmed && !imageName) || submitting) return;
        const fd = new FormData(event.currentTarget);

        async function submit() {
          setSubmitting(true);
          setError(null);
          try {
            const result = await addSupportCommentAction(requestId, fd);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setBody('');
            setImageName(null);
            formRef.current?.reset();
            toast({ title: '댓글을 등록했습니다.' });
            router.refresh();
          } finally {
            setSubmitting(false);
          }
        }

        void submit();
      }}
      ref={formRef}
      className="space-y-2"
    >
      <textarea
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="댓글 입력 (최대 2000자)"
        className="w-full resize-y rounded-md border bg-background p-3 text-sm"
        aria-label="댓글 입력"
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {allowImage && (
        <div className="space-y-1">
          <input
            name="image"
            type="file"
            accept={COMMENT_IMAGE_ACCEPT}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setImageName(file?.name ?? null);
            }}
            className="block w-full text-sm"
            aria-label="댓글 이미지 첨부"
          />
          {imageName && <p className="text-xs text-muted-foreground">{imageName}</p>}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {submitting ? '등록 중...' : '댓글 등록'}
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
  canEditImage = false,
  body,
  image,
}: {
  commentId: string;
  createdAt: string;
  isAuthor: boolean;
  isAdmin: boolean;
  canEditImage?: boolean;
  body: string;
  image?: SupportCommentImageRow | null;
}) {
  const created = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [removeImage, setRemoveImage] = useState(false);
  const [replacementImageName, setReplacementImageName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const replacementImageRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, element } = useConfirm();

  useEffect(() => {
    if (isAdmin || !isAuthor) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [isAdmin, isAuthor]);

  useEffect(() => {
    if (!editing) {
      setDraft(body);
      setRemoveImage(false);
      setReplacementImageName(null);
    }
  }, [body, editing]);

  const editable = isAdmin || (isAuthor && now - created < SUPPORT_COMMENT_EDIT_WINDOW_MS);
  if (!editable) return null;

  async function onDelete() {
    if (deleting) return;

    const result = await confirm({
      title: '이 댓글을 삭제할까요?',
      description: '삭제하면 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      cancelLabel: '닫기',
      tone: 'destructive',
    });
    if (!result.ok) return;

    setDeleting(true);
    try {
      const actionResult = await deleteSupportCommentAction(commentId);
      if (!actionResult.ok) {
        toast({ title: '삭제 실패', description: actionResult.error, variant: 'destructive' });
        return;
      }
      toast({ title: '삭제했습니다.' });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function onSave() {
    const trimmed = draft.trim();
    const replacementImage = canEditImage ? (replacementImageRef.current?.files?.[0] ?? null) : null;
    const willHaveImage = Boolean(replacementImage || (image && !removeImage));
    if ((!trimmed && !willHaveImage) || saving) return;

    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('body', draft);
      if (canEditImage && removeImage) fd.set('removeImage', '1');
      if (replacementImage) fd.set('image', replacementImage);
      const result = await updateSupportCommentAction(commentId, fd);
      if (!result.ok) {
        toast({ title: '수정 실패', description: result.error, variant: 'destructive' });
        return;
      }
      setEditing(false);
      setRemoveImage(false);
      setReplacementImageName(null);
      toast({ title: '수정했습니다.' });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const editWillHaveImage = Boolean(replacementImageName || (image && !removeImage));
  const canSaveEdit = draft.trim().length > 0 || editWillHaveImage;

  if (editing) {
    return (
      <>
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-md border bg-background p-2 text-sm"
            aria-label="댓글 수정"
          />
          {canEditImage && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {image && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={removeImage}
                    disabled={Boolean(replacementImageName)}
                    onChange={(event) => setRemoveImage(event.currentTarget.checked)}
                  />
                  <span>기존 이미지 삭제: {image.original_name}</span>
                </label>
              )}
              <input
                ref={replacementImageRef}
                type="file"
                accept={COMMENT_IMAGE_ACCEPT}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setReplacementImageName(file?.name ?? null);
                  if (file) setRemoveImage(false);
                }}
                className="block w-full text-sm"
                aria-label="댓글 이미지 교체"
              />
              {replacementImageName && <p>{replacementImageName}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saving || !canSaveEdit}
              onClick={() => void onSave()}
              aria-label="댓글 수정 저장"
            >
              저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              aria-label="댓글 수정 취소"
              onClick={() => {
                setEditing(false);
                setDraft(body);
                setRemoveImage(false);
                setReplacementImageName(null);
                if (replacementImageRef.current) replacementImageRef.current.value = '';
              }}
            >
              취소
            </Button>
          </div>
        </div>
        {element}
      </>
    );
  }

  return (
    <>
      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="hover:underline"
          aria-label="댓글 수정"
          onClick={() => {
            setDraft(body);
            setRemoveImage(false);
            setReplacementImageName(null);
            setEditing(true);
          }}
        >
          수정
        </button>
        <button
          type="button"
          className="text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          disabled={deleting}
          aria-label="댓글 삭제"
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
      {element}
    </>
  );
}
