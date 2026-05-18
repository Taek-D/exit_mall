import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { SupportAttachmentList } from '@/components/support/SupportAttachmentList';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { SupportCommentForm } from '@/components/support/SupportCommentForm';
import { SupportCommentList } from '@/components/support/SupportCommentList';
import { markSupportReadAction } from '@/lib/actions/support-request';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isSupportLocked } from '@/lib/support/permissions';
import { fetchSupportRequest } from '@/lib/support/queries';
import { createClient } from '@/lib/supabase/server';
import { SUPPORT_REFERENCE_TYPE_LABEL } from '@/lib/types';
import { CancelSupportRequestButton } from './CancelSupportRequestButton';

export const dynamic = 'force-dynamic';

export default async function SupportRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchSupportRequest(params.id);
  if (!request) notFound();

  await markSupportReadAction(request.id, request.last_comment_at);

  const locked = isSupportLocked(request.status);
  const hasReference = request.reference_type !== 'none' && request.reference_value;

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link
            href="/support-requests"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 교환/반품 및 CS 문의
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SupportCategoryBadge category={request.category} />
            <SupportStatusBadge status={request.status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight truncate">
              {request.title}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            작성 {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        {request.status === 'open' && <CancelSupportRequestButton requestId={request.id} />}
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {hasReference && (
          <p className="text-sm text-muted-foreground">
            {SUPPORT_REFERENCE_TYPE_LABEL[request.reference_type]}:{' '}
            <span className="text-foreground">{request.reference_value}</span>
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap">{request.body}</p>
        <SupportAttachmentList requestId={request.id} attachments={request.attachments} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <SupportCommentList
          comments={comments}
          currentUserId={u.user.id}
          isAdmin={false}
          locked={locked}
        />
        <SupportCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={
            request.status === 'completed'
              ? '완료된 문의에는 댓글을 작성할 수 없습니다.'
              : request.status === 'cancelled'
                ? '취소된 문의에는 댓글을 작성할 수 없습니다.'
                : undefined
          }
        />
      </section>
    </div>
  );
}
