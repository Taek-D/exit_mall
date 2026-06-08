import { callRpc } from '@/lib/actions/_shared';
import { createClient } from '@/lib/supabase/server';
import type { SupportCategory, SupportReferenceType, SupportStatus } from '@/lib/types';

export type SupportListRow = {
  id: string;
  user_id: string;
  category: SupportCategory;
  title: string;
  status: SupportStatus;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: { name: string; email?: string } | null;
};

export type SupportAttachmentRow = {
  id: string;
  request_id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type SupportCommentImageRow = {
  id: string;
  comment_id: string;
  request_id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type SupportRequestDetail = SupportListRow & {
  body: string;
  reference_type: SupportReferenceType;
  reference_value: string | null;
  attachments: SupportAttachmentRow[];
};

export type SupportCommentRow = {
  id: string;
  request_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  image?: SupportCommentImageRow | null;
};

type SearchSupportRow = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  status: string;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  profile_name: string | null;
  profile_email: string | null;
};

export async function fetchMySupportRequests(limit = 50): Promise<SupportListRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('support_requests')
    .select(
      'id,user_id,category,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[support] fetchMySupportRequests', error);
    return [];
  }

  return (data ?? []) as unknown as SupportListRow[];
}

export async function fetchAllSupportRequests({
  status = 'all',
  category = 'all',
  limit = 200,
  search,
}: {
  status?: SupportStatus | 'all';
  category?: SupportCategory | 'all';
  limit?: number;
  search?: string;
} = {}): Promise<SupportListRow[]> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'search_support_requests', {
    p_q: search?.trim() || null,
    p_status: status === 'all' ? null : status,
    p_category: category === 'all' ? null : category,
    p_limit: limit,
  });

  if (error) {
    console.error('[support] fetchAllSupportRequests', error);
    return [];
  }

  return ((data ?? []) as SearchSupportRow[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    category: row.category as SupportCategory,
    title: row.title,
    status: row.status as SupportStatus,
    last_comment_at: row.last_comment_at,
    last_comment_by_role: row.last_comment_by_role,
    user_last_read_at: row.user_last_read_at,
    admin_last_read_at: row.admin_last_read_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    profile: row.profile_name
      ? { name: row.profile_name, email: row.profile_email ?? undefined }
      : null,
  }));
}

export async function fetchSupportRequest(id: string): Promise<{
  request: SupportRequestDetail | null;
  comments: SupportCommentRow[];
}> {
  const supabase = createClient();
  const [
    { data: request, error: requestError },
    { data: attachments, error: attachmentsError },
    { data: comments, error: commentsError },
    { data: commentImages, error: commentImagesError },
  ] = await Promise.all([
    supabase
      .from('support_requests')
      .select(
        'id,user_id,category,title,body,reference_type,reference_value,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('support_request_attachments')
      .select('id,request_id,user_id,storage_path,original_name,content_type,size_bytes,created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_request_comments')
      .select('id,request_id,author_id,author_role,body,created_at,updated_at,deleted_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_request_comment_images')
      .select('id,comment_id,request_id,user_id,storage_path,original_name,content_type,size_bytes,created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (requestError) {
    console.error('[support] fetchSupportRequest request', requestError);
    return { request: null, comments: [] };
  }

  if (!request) {
    return { request: null, comments: [] };
  }

  if (attachmentsError) {
    console.error('[support] fetchSupportRequest attachments', attachmentsError);
  }
  if (commentsError) {
    console.error('[support] fetchSupportRequest comments', commentsError);
  }
  if (commentImagesError) {
    console.error('[support] fetchSupportRequest comment images', commentImagesError);
  }

  const imageByCommentId = new Map(
    (commentImagesError ? [] : ((commentImages ?? []) as unknown as SupportCommentImageRow[])).map(
      (image) => [image.comment_id, image] as const,
    ),
  );

  return {
    request: {
      ...(request as unknown as Omit<SupportRequestDetail, 'attachments'>),
      attachments: attachmentsError ? [] : (attachments ?? []) as unknown as SupportAttachmentRow[],
    },
    comments: commentsError
      ? []
      : ((comments ?? []) as unknown as SupportCommentRow[]).map((comment) => ({
          ...comment,
          image: imageByCommentId.get(comment.id) ?? null,
        })),
  };
}

export async function fetchSupportUnreadCount(role: 'user' | 'admin'): Promise<number> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'count_support_unread', {
    p_role: role,
  });

  if (error || data == null) {
    if (error) console.error('[support] fetchSupportUnreadCount', error);
    return 0;
  }

  return Number(data) || 0;
}
