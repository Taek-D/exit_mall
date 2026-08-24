import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/actions/_shared';
import type { InboundStatus } from '@/lib/types';

export type InboundListRow = {
  id: string;
  user_id: string;
  title: string;
  status: InboundStatus;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  tracking_numbers: string[];
  profile?: { name: string } | null;
};

/** 같은 송장번호 + 같은 상품이 겹치는 다른 입고요청. */
export type InboundDuplicateRow = {
  id: string;
  title: string;
  status: InboundStatus;
  created_at: string;
  shared_tracking: string[];
  shared_products: string[];
  overlap_count: number;
};

export type InboundRequestItem = {
  product_name: string;
  option_name?: string | null;
  quantity: number;
  row_number?: number | null;
  gift?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  memo?: string | null;
};

export type InboundRequestDetail = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  status: InboundStatus;
  excel_storage_path: string;
  excel_original_name: string;
  image_paths: string[];
  inbound_items: InboundRequestItem[];
  tracking_numbers: string[];
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InboundCommentRow = {
  id: string;
  request_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// NOTE: inbound_requests and inbound_request_comments are not yet in db-types.ts.
// Types will be regenerated after the migration is applied to the remote project.

export async function fetchMyInboundRequests(limit = 50): Promise<InboundListRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('inbound_requests')
    .select(
      'id,user_id,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at,tracking_numbers',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[inbound] fetchMyInboundRequests', error);
    return [];
  }
  return (data ?? []) as InboundListRow[];
}

type SearchInboundRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  tracking_numbers: string[] | null;
  profile_name: string;
  profile_email: string;
};

export async function fetchAllInboundRequests(
  status: InboundStatus | 'all' = 'all',
  limit = 100,
  search?: string,
  missingTracking = false,
): Promise<InboundListRow[]> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'search_inbound_requests', {
    p_q: search?.trim() || null,
    p_status: status === 'all' ? null : status,
    p_limit: limit,
    p_missing_tracking: missingTracking,
  });
  if (error) {
    console.error('[inbound] fetchAllInboundRequests', error);
    return [];
  }
  const rows = (data ?? []) as SearchInboundRow[];
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    status: row.status as InboundStatus,
    last_comment_at: row.last_comment_at,
    last_comment_by_role: row.last_comment_by_role,
    user_last_read_at: row.user_last_read_at,
    admin_last_read_at: row.admin_last_read_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tracking_numbers: row.tracking_numbers ?? [],
    profile: { name: row.profile_name },
  }));
}

export async function fetchInboundDuplicates(
  requestId: string,
): Promise<InboundDuplicateRow[]> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'find_inbound_duplicates', {
    p_request_id: requestId,
  });
  if (error) {
    console.error('[inbound] fetchInboundDuplicates', error);
    return [];
  }
  return (data ?? []) as unknown as InboundDuplicateRow[];
}

export async function fetchInboundRequest(id: string): Promise<{
  request: InboundRequestDetail | null;
  comments: InboundCommentRow[];
}> {
  const supabase = createClient();
  const [{ data: r }, { data: cs }] = await Promise.all([
    supabase
      .from('inbound_requests')
      .select(
        'id,user_id,title,body,status,excel_storage_path,excel_original_name,image_paths,inbound_items,tracking_numbers,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('inbound_request_comments')
      .select(
        'id,request_id,author_id,author_role,body,created_at,updated_at,deleted_at',
      )
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
  ]);
  if (!r) {
    return { request: null, comments: (cs ?? []) as unknown as InboundCommentRow[] };
  }
  const rawRequest = r as unknown as Omit<InboundRequestDetail, 'inbound_items'> & {
    inbound_items: unknown;
  };
  const items: InboundRequestItem[] = Array.isArray(rawRequest.inbound_items)
    ? (rawRequest.inbound_items as InboundRequestItem[])
    : [];
  return {
    request: {
      ...rawRequest,
      inbound_items: items,
      tracking_numbers: rawRequest.tracking_numbers ?? [],
    } as InboundRequestDetail,
    comments: (cs ?? []) as unknown as InboundCommentRow[],
  };
}

export async function fetchUnreadCount(role: 'user' | 'admin'): Promise<number> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'count_inbound_unread', {
    p_role: role,
  });
  if (error || data == null) {
    if (error) console.error('[inbound] fetchUnreadCount', error);
    return 0;
  }
  return Number(data) || 0;
}
