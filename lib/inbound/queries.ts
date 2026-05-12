import { createClient } from '@/lib/supabase/server';
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
  comment_count?: number;
  profile?: { name: string } | null;
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
  const { data, error } = await (supabase.from as any)('inbound_requests')
    .select(
      'id,user_id,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[inbound] fetchMyInboundRequests', error);
    return [];
  }
  return (data ?? []) as InboundListRow[];
}

export async function fetchAllInboundRequests(
  status: InboundStatus | 'all' = 'all',
  limit = 100,
): Promise<InboundListRow[]> {
  const supabase = createClient();
  let q = (supabase.from as any)('inbound_requests')
    .select(
      'id,user_id,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at,profiles!inbound_requests_user_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) {
    console.error('[inbound] fetchAllInboundRequests', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    profile: row.profiles ?? null,
  })) as InboundListRow[];
}

export async function fetchInboundRequest(id: string): Promise<{
  request: InboundRequestDetail | null;
  comments: InboundCommentRow[];
}> {
  const supabase = createClient();
  const [{ data: r }, { data: cs }] = await Promise.all([
    (supabase.from as any)('inbound_requests').select('*').eq('id', id).maybeSingle(),
    (supabase.from as any)('inbound_request_comments')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
  ]);
  return {
    request: (r as InboundRequestDetail) ?? null,
    comments: (cs ?? []) as InboundCommentRow[],
  };
}

export async function fetchUnreadCount(role: 'user' | 'admin'): Promise<number> {
  const supabase = createClient();
  const { data, error } = await (supabase.from as any)('inbound_requests').select(
    'id,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at',
  );
  if (error || !data) return 0;
  const rows = data as Array<{
    last_comment_at: string | null;
    last_comment_by_role: 'user' | 'admin' | null;
    user_last_read_at: string | null;
    admin_last_read_at: string | null;
  }>;
  return rows.filter((r) => {
    if (!r.last_comment_at) return false;
    if (role === 'user') {
      return (
        r.last_comment_by_role === 'admin' &&
        (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at)
      );
    } else {
      return (
        r.last_comment_by_role === 'user' &&
        (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at)
      );
    }
  }).length;
}
