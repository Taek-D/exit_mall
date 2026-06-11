'use server';

import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { supportDetailPaths } from '@/lib/actions/_revalidate-paths';
import { requireSignedIn } from '@/lib/actions/_guards';
import { supportRequestCreateSchema } from '@/lib/schemas';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  mapSubmitSupportRequestError,
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
} from '@/lib/support/action-errors';
import { getSupportCommentAccessError, isSupportLocked } from '@/lib/support/permissions';
import {
  supportCleanupPaths,
  supportCommentImagePath,
} from '@/lib/support/upload-paths';
import {
  cleanupCommentImageStorage,
  cleanupFailedSupportRequest,
  collectAttachments,
  collectCommentImage,
  uploadSupportAttachments,
  uploadSupportCommentImage,
  validateSupportCommentBody,
  type SupportUploadError,
} from '@/lib/support/uploads';
import type { SupportStatus } from '@/lib/types';

const SUPPORT_ATTACHMENT_SIGNED_URL_SECONDS = 30 * 60;

export type SubmitSupportResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };


export async function submitSupportRequestAction(
  _prevState: SubmitSupportResult | null,
  fd: FormData,
): Promise<SubmitSupportResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

  const parsed = supportRequestCreateSchema.safeParse({
    category: String(fd.get('category') ?? ''),
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
    referenceType: String(fd.get('referenceType') ?? 'none'),
    referenceValue: String(fd.get('referenceValue') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const attachments = await collectAttachments(fd);
  if (!Array.isArray(attachments)) return { ok: false, error: attachments.error };

  const { data: requestIdData, error: rpcErr } = await callRpc(
    supabase,
    'submit_support_request_rpc',
    {
      p_category: parsed.data.category,
      p_title: parsed.data.title,
      p_body: parsed.data.body,
      p_reference_type: parsed.data.referenceType,
      p_reference_value: parsed.data.referenceValue,
    },
  );

  if (rpcErr || !requestIdData) {
    const mapped = mapSubmitSupportRequestError(rpcErr?.message ?? '');
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] submit_support_request_rpc', rpcErr);
    const detail = rpcErr?.message?.trim();
    return {
      ok: false,
      error: detail
        ? `문의 등록에 실패했습니다: ${detail}`
        : '문의 등록에 실패했습니다.',
    };
  }

  const requestId = String(requestIdData);

  try {
    await uploadSupportAttachments(supabase, user.id, requestId, attachments);
  } catch (error) {
    // 부분 진행 상태를 받아 정확히 cleanup. (분할 전 동일 함수에서 보장하던 동작 복구)
    const partial = (error as SupportUploadError).partial ?? {
      uploadedPaths: [],
      insertedAttachmentIds: [],
    };
    await cleanupFailedSupportRequest({
      supabase,
      requestId,
      insertedAttachmentIds: partial.insertedAttachmentIds,
    });
    // 업로드된 storage 객체 cleanup은 트랜잭션 외부이므로 best-effort.
    const cleanupPaths = supportCleanupPaths(partial.uploadedPaths);
    if (cleanupPaths.length > 0) {
      const cleanupSupabase = (
        process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase
      ) as ReturnType<typeof createClient>;
      const { error: storageCleanupError } = await cleanupSupabase.storage
        .from('support-requests')
        .remove(cleanupPaths);
      if (storageCleanupError) {
        console.error('[support] rollback storage cleanup failed', storageCleanupError);
      }
    }

    console.error('[support] attachment upload failed', error);
    return { ok: false, error: '첨부파일 업로드에 실패했습니다. 다시 시도해주세요.' };
  }

  revalidatePaths(['/support-requests', '/admin/support-requests']);
  // 서버 redirect로 네비게이션을 처리한다 — progressive enhancement로 JS/하이드레이션
  // 여부와 무관하게 동작한다. 클라이언트 중복 네비게이션(과거 useEffect router.push)은
  // 폼에서 제거됐다. 성공 경로는 throw(never)이므로 호출 측 state는 갱신되지 않는다.
  redirect(`/support-requests/${requestId}`);
}

export async function cancelSupportRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_support_request', {
    p_request_id: requestId,
  });
  if (error) {
    const mapped = mapSupportCancelError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function setSupportStatusAction(
  requestId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled',
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'set_support_status', {
    p_request_id: requestId,
    p_new_status: newStatus,
  });
  if (error) {
    const mapped = mapSupportStatusError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] setStatus', { requestId, newStatus, error });
    return { ok: false, error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function markSupportReadAction(
  requestId: string,
  seenLastCommentAt: string | null = null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_support_read', {
    p_request_id: requestId,
    p_seen_last_comment_at: seenLastCommentAt,
  });
  if (error) {
    console.error('[support] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function addSupportCommentAction(
  requestId: string,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  // 권한은 add_support_comment RPC + RLS가 검증하고, 이미지 첨부는 아래 admin guard가 제한한다.
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const image = await collectCommentImage(fd);
  if (image && !('file' in image)) return { ok: false, error: image.error };
  const hasImage = Boolean(image);
  const isAdmin = profile.role === 'admin';
  if (hasImage && !isAdmin) {
    return { ok: false, error: '관리자만 댓글 이미지를 첨부할 수 있습니다.' };
  }

  const parsed = validateSupportCommentBody({
    body: String(fd.get('body') ?? ''),
    hasImage,
    isAdmin,
  });
  if (!parsed.ok) return parsed;

  const { data, error } = await callRpc(supabase, 'add_support_comment', {
    p_request_id: requestId,
    p_body: parsed.body,
    p_has_image: hasImage,
  });
  if (error) {
    const mapped = mapSupportCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] addComment', { requestId, error });
    return { ok: false, error: '댓글 작성에 실패했습니다.' };
  }
  const commentId = String(data);
  if (image && 'file' in image) {
    try {
      await uploadSupportCommentImage({
        supabase,
        userId: user.id,
        requestId,
        commentId,
        image,
      });
    } catch (uploadError) {
      const { error: rollbackError } = await callRpc(supabase, 'delete_support_comment', {
        p_comment_id: commentId,
      });
      if (rollbackError) {
        console.error('[support] rollback comment after image upload failed', {
          commentId,
          rollbackError,
        });
      }
      console.error('[support] comment image upload failed', { requestId, commentId, uploadError });
      return { ok: false, error: '댓글 이미지 업로드에 실패했습니다. 다시 시도해주세요.' };
    }
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true, id: commentId };
}

type CommentRow = {
  author_id: string;
  author_role: 'admin' | 'user';
  created_at: string;
  request_id: string;
};
type ExistingCommentImageRow = {
  id: string;
  comment_id: string;
  request_id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
};
type CommentImageRow = ExistingCommentImageRow | null;
type SupportRequestStatusRow = { status: SupportStatus };

async function assertSupportRequestEditable(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
): Promise<ActionResult> {
  const { data: request, error } = (await supabase
    .from('support_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()) as { data: SupportRequestStatusRow | null; error: unknown };

  if (error || !request) {
    if (error) console.error('[support] fetch request for comment mutation', { requestId, error });
    return { ok: false, error: 'Support request not found.' };
  }

  if (isSupportLocked(request.status)) {
    return {
      ok: false,
      error: mapSupportCommentError('LOCKED') ?? 'Support request is locked.',
    };
  }

  return { ok: true };
}

export async function updateSupportCommentAction(
  commentId: string,
  fd: FormData,
): Promise<ActionResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, author_role, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '수정',
  });
  if (accessError) return { ok: false, error: accessError };

  const editable = await assertSupportRequestEditable(supabase, row.request_id);
  if (!editable.ok) return editable;

  const isAdmin = profile.role === 'admin';
  const hasSubmittedImage = fd
    .getAll('image')
    .some((entry) => entry instanceof File && entry.size > 0);
  const removeImage = fd.get('removeImage') === '1';
  if ((hasSubmittedImage || removeImage) && row.author_role !== 'admin') {
    return { ok: false, error: '관리자 댓글에만 이미지를 첨부할 수 있습니다.' };
  }

  const image = await collectCommentImage(fd);
  if (image && !('file' in image)) return { ok: false, error: image.error };
  if ((image || removeImage) && !isAdmin) {
    return { ok: false, error: '관리자만 댓글 이미지를 수정할 수 있습니다.' };
  }

  const { data: currentImage } = (await supabase
    .from('support_request_comment_images')
    .select('id,comment_id,request_id,user_id,storage_path,original_name,content_type,size_bytes')
    .eq('comment_id', commentId)
    .maybeSingle()) as { data: CommentImageRow; error: unknown };

  const willHaveImage = Boolean(image || (currentImage && !removeImage));
  const parsed = validateSupportCommentBody({
    body: String(fd.get('body') ?? ''),
    hasImage: willHaveImage,
    isAdmin,
  });
  if (!parsed.ok) return parsed;

  let uploadedPath: string | null = null;
  let oldPathToCleanup: string | null = null;
  let changedImageId: string | null = null;
  let shouldRestoreRemovedImage = false;
  if (image && 'file' in image) {
    const imageId = currentImage?.id ?? randomUUID();
    changedImageId = imageId;
    uploadedPath = supportCommentImagePath({
      userId: user.id,
      requestId: row.request_id,
      commentId,
      imageId,
      originalName: image.file.name,
    });

    const { error: uploadErr } = await supabase.storage
      .from('support-requests')
      .upload(uploadedPath, image.buffer, {
        contentType: image.contentType,
        upsert: false,
      });
    if (uploadErr) {
      console.error('[support] update comment image upload', { commentId, uploadErr });
      return { ok: false, error: '댓글 이미지 업로드에 실패했습니다. 다시 시도해주세요.' };
    }

    const imagePayload = {
      id: imageId,
      comment_id: commentId,
      request_id: row.request_id,
      user_id: user.id,
      storage_path: uploadedPath,
      original_name: image.file.name,
      content_type: image.contentType,
      size_bytes: image.file.size,
    };
    const imageMutation = currentImage
      ? await mutationTable(supabase, 'support_request_comment_images')
          .update(imagePayload)
          .eq('id', currentImage.id)
      : await mutationTable(supabase, 'support_request_comment_images').insert(imagePayload);
    if (imageMutation.error) {
      await cleanupCommentImageStorage(supabase, [uploadedPath]);
      console.error('[support] update comment image metadata', {
        commentId,
        error: imageMutation.error,
      });
      return { ok: false, error: '댓글 이미지 저장에 실패했습니다. 다시 시도해주세요.' };
    }
    oldPathToCleanup = currentImage?.storage_path ?? null;
  } else if (removeImage && currentImage) {
    const { error: deleteImageError } = await mutationTable(
      supabase,
      'support_request_comment_images',
    )
      .delete()
      .eq('id', currentImage.id);
    if (deleteImageError) {
      console.error('[support] delete comment image metadata', { commentId, deleteImageError });
      return { ok: false, error: '댓글 이미지 삭제에 실패했습니다. 다시 시도해주세요.' };
    }
    shouldRestoreRemovedImage = true;
    oldPathToCleanup = currentImage.storage_path;
  }

  const { error } = await mutationTable(supabase, 'support_request_comments')
    .update({ body: parsed.body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) {
    let cleanupUploadedPath = Boolean(uploadedPath);
    if (uploadedPath && currentImage) {
      const { error: restoreError } = await mutationTable(
        supabase,
        'support_request_comment_images',
      )
        .update(currentImage)
        .eq('id', currentImage.id);
      if (restoreError) {
        console.error('[support] restore previous comment image metadata failed', {
          commentId,
          restoreError,
        });
        cleanupUploadedPath = false;
      }
    } else if (uploadedPath && changedImageId) {
      const { error: deleteInsertedImageError } = await mutationTable(
        supabase,
        'support_request_comment_images',
      )
        .delete()
        .eq('id', changedImageId);
      if (deleteInsertedImageError) {
        console.error('[support] rollback inserted comment image metadata failed', {
          commentId,
          deleteInsertedImageError,
        });
      }
    } else if (shouldRestoreRemovedImage && currentImage) {
      const { error: restoreDeletedImageError } = await mutationTable(
        supabase,
        'support_request_comment_images',
      ).insert(currentImage);
      if (restoreDeletedImageError) {
        console.error('[support] restore deleted comment image metadata failed', {
          commentId,
          restoreDeletedImageError,
        });
      }
    }
    if (uploadedPath && cleanupUploadedPath) await cleanupCommentImageStorage(supabase, [uploadedPath]);
    console.error('[support] updateComment', { commentId, error });
    return { ok: false, error: '댓글 수정에 실패했습니다.' };
  }
  if (oldPathToCleanup) await cleanupCommentImageStorage(supabase, [oldPathToCleanup]);
  revalidatePaths([`/support-requests/${row.request_id}`, `/admin/support-requests/${row.request_id}`]);
  return { ok: true };
}

export async function deleteSupportCommentAction(commentId: string): Promise<ActionResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, author_role, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '삭제',
  });
  if (accessError) return { ok: false, error: accessError };

  const editable = await assertSupportRequestEditable(supabase, row.request_id);
  if (!editable.ok) return editable;

  const { data: images } = (await supabase
    .from('support_request_comment_images')
    .select('storage_path')
    .eq('comment_id', commentId)) as { data: { storage_path: string }[] | null; error: unknown };

  const { error } = await callRpc(supabase, 'delete_support_comment', {
    p_comment_id: commentId,
  });
  if (error) {
    const mapped = mapSupportCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  await cleanupCommentImageStorage(
    supabase,
    (images ?? []).map((image) => image.storage_path),
  );
  revalidatePaths(supportDetailPaths(row.request_id));
  return { ok: true };
}

export type SupportAttachmentUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function getSupportAttachmentUrlAction(
  requestId: string,
  attachmentId: string,
): Promise<SupportAttachmentUrlResult> {
  const supabase = createClient();
  const { data: attachment } = (await supabase
    .from('support_request_attachments')
    .select('id,request_id,storage_path')
    .eq('id', attachmentId)
    .eq('request_id', requestId)
    .maybeSingle()) as { data: { storage_path: string } | null; error: unknown };
  if (!attachment) return { ok: false, error: '첨부파일을 찾을 수 없습니다.' };

  const { data, error } = await supabase.storage
    .from('support-requests')
    .createSignedUrl(attachment.storage_path, SUPPORT_ATTACHMENT_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function getSupportCommentImageUrlAction(
  requestId: string,
  imageId: string,
): Promise<SupportAttachmentUrlResult> {
  const supabase = createClient();
  const { data: image } = (await supabase
    .from('support_request_comment_images')
    .select('id,request_id,storage_path')
    .eq('id', imageId)
    .eq('request_id', requestId)
    .maybeSingle()) as { data: { storage_path: string } | null; error: unknown };
  if (!image) return { ok: false, error: '댓글 이미지를 찾을 수 없습니다.' };

  const { data, error } = await supabase.storage
    .from('support-requests')
    .createSignedUrl(image.storage_path, SUPPORT_ATTACHMENT_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}
