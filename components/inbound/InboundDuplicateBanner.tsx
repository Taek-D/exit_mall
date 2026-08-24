import Link from 'next/link';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { formatShortDateKR } from '@/lib/dates';
import type { InboundDuplicateRow } from '@/lib/inbound/queries';
import { INBOUND_STATUS_LABEL, type InboundStatus } from '@/lib/types';

/**
 * 같은 송장번호로 같은 상품이 이미 등록돼 있을 때 띄우는 경고.
 *
 * 송장번호만 겹치는 경우(박스 하나를 상품별로 나눠 등록)는 정상 사용이라
 * 대상이 아니다. 상품까지 겹칠 때만 뜨므로 실제 발생 빈도가 낮고,
 * 그래서 관리자가 무시하지 않는다.
 */
export function InboundDuplicateBanner({
  duplicates,
  variant,
  cancellable = false,
}: {
  duplicates: InboundDuplicateRow[];
  variant: 'admin' | 'user';
  cancellable?: boolean;
}) {
  if (!duplicates.length) return null;

  const [first, ...rest] = duplicates;
  const basePath = variant === 'admin' ? '/admin/inbound-requests' : '/inbound-requests';
  const tracking = first.shared_tracking[0] ?? '';
  const firstLabel = `${formatShortDateKR(first.created_at)} 입고요청`;
  const otherText = rest.length > 0 ? ` 외 ${rest.length}건` : '';

  if (variant === 'user') {
    return (
      <div className="rounded-md border bg-surface-muted px-3.5 py-3">
        <div className="flex gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium">같은 송장번호로 등록하신 요청이 있습니다</p>
            <p className="text-sm leading-relaxed">
              송장번호 <span className="font-mono tabular">{tracking}</span>의 상품{' '}
              {first.overlap_count}건이 {firstLabel}
              {otherText}에도 들어 있습니다.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {cancellable
                ? '같은 박스를 두 번 올리셨다면 이 요청을 취소해 주세요. 나눠서 등록하신 거라면 그대로 두셔도 됩니다.'
                : '이미 검토가 시작되어 직접 취소하실 수 없습니다. 잘못 등록하신 거라면 아래 댓글로 알려주세요.'}
            </p>
            <Link
              href={`${basePath}/${first.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
            >
              {firstLabel} 보기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-3">
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-warning">중복 입고 가능성</p>
          <p className="text-sm leading-relaxed">
            송장번호 <span className="font-mono tabular">{tracking}</span>의 상품{' '}
            {first.overlap_count}건이 {firstLabel}(
            {INBOUND_STATUS_LABEL[first.status as InboundStatus]}){otherText}에도 들어 있습니다.
            완료 처리하면 사입재고에 두 번 반영됩니다.
          </p>

          {first.shared_products.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                겹치는 상품 {first.shared_products.length}건 보기
              </summary>
              <ul className="mt-1.5 space-y-0.5 pl-4">
                {first.shared_products.map((label) => (
                  <li key={label} className="list-disc text-muted-foreground">
                    {label}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <ul className="space-y-1">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link
                  href={`${basePath}/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
                >
                  {formatShortDateKR(d.created_at)} 입고요청 (
                  {INBOUND_STATUS_LABEL[d.status as InboundStatus]}) 열기
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
