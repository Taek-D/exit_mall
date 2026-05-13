import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchInboundRequest } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { InboundAttachmentList } from '@/components/inbound/InboundAttachmentList';
import { InboundCommentList } from '@/components/inbound/InboundCommentList';
import { InboundCommentForm } from '@/components/inbound/InboundCommentForm';
import { StatusControls } from './StatusControls';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isLocked } from '@/lib/inbound/permissions';
import { markInboundReadAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminInboundRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchInboundRequest(params.id);
  if (!request) notFound();

  const { data: author } = await supabase
    .from('profiles')
    .select('name,email')
    .eq('id', request.user_id)
    .maybeSingle<{ name: string; email: string }>();

  await markInboundReadAction(request.id);

  const status = request.status as InboundStatus;
  const locked = isLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link
            href="/admin/inbound-requests"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 입고리스트
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <InboundStatusBadge status={status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight truncate">
              {request.title}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            작성자 {author?.name ?? '—'} ({author?.email ?? '—'}) ·{' '}
            {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        <StatusControls requestId={request.id} status={status} />
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.body && <p className="text-sm whitespace-pre-wrap">{request.body}</p>}
        <InboundAttachmentList
          requestId={request.id}
          excelPath={request.excel_storage_path}
          excelOriginalName={request.excel_original_name}
          imagePaths={request.image_paths}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <InboundCommentList comments={comments} currentUserId={u.user.id} isAdmin />
        <InboundCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={locked ? '종결된 요청에는 댓글을 작성할 수 없습니다.' : undefined}
        />
      </section>
    </div>
  );
}
