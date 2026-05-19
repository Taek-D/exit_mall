import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchInboundRequest } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { InboundAttachmentList } from '@/components/inbound/InboundAttachmentList';
import { InboundCommentList } from '@/components/inbound/InboundCommentList';
import { InboundCommentForm } from '@/components/inbound/InboundCommentForm';
import { InboundItemsTable } from '@/components/inbound/InboundItemsTable';
import { CancelInboundButton } from './CancelInboundButton';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isLocked } from '@/lib/inbound/permissions';
import { markInboundReadAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InboundRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchInboundRequest(params.id);
  if (!request) notFound();

  await markInboundReadAction(request.id);

  const status = request.status as InboundStatus;
  const locked = isLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link
            href="/inbound-requests"
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
            작성 {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        {status === 'open' && <CancelInboundButton requestId={request.id} />}
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.body && <p className="text-sm whitespace-pre-wrap">{request.body}</p>}
        <InboundAttachmentList
          requestId={request.id}
          excelPath={request.excel_storage_path}
          excelOriginalName={request.excel_original_name}
          imagePaths={request.image_paths}
        />
        <InboundItemsTable items={request.inbound_items} status={status} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <InboundCommentList comments={comments} currentUserId={u.user.id} isAdmin={false} />
        <InboundCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={
            status === 'completed'
              ? '완료된 요청이라 댓글을 작성할 수 없습니다.'
              : status === 'cancelled'
                ? '취소된 요청이라 댓글을 작성할 수 없습니다.'
                : undefined
          }
        />
      </section>
    </div>
  );
}
