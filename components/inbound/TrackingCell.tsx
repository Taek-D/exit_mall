import { normalizeTracking } from '@/lib/inbound/tracking';

/**
 * 목록에서 요청의 송장번호를 보여준다. 요청 하나에 송장이 여러 개인 경우가
 * 3분의 1이라 첫 번째만 쓰고 나머지는 "외 N"으로 접는다.
 *
 * 검색어(정규화된 숫자)가 있으면 일치 구간을 강조한다. 하이픈 등이 섞여
 * 저장된 값은 원문과 자릿수가 어긋나므로 강조를 생략한다.
 */
export function TrackingCell({
  trackingNumbers,
  highlight,
}: {
  trackingNumbers: string[];
  highlight?: string;
}) {
  if (!trackingNumbers.length) {
    return <span className="text-muted-foreground">—</span>;
  }

  const [first, ...rest] = trackingNumbers;
  const matched = highlight
    ? trackingNumbers.find((t) => normalizeTracking(t).includes(highlight))
    : undefined;
  const shown = matched ?? first;
  const hiddenCount = trackingNumbers.length - 1;

  return (
    <span className="font-mono tabular text-xs">
      {renderHighlighted(shown, highlight)}
      {hiddenCount > 0 && (
        <span className="ml-1 font-sans text-muted-foreground">외 {hiddenCount}</span>
      )}
    </span>
  );
}

function renderHighlighted(value: string, highlight?: string) {
  if (!highlight) return value;
  if (normalizeTracking(value) !== value.toUpperCase()) return value;

  const index = value.toUpperCase().indexOf(highlight);
  if (index < 0) return value;

  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-warning/20 px-0.5 text-warning">
        {value.slice(index, index + highlight.length)}
      </mark>
      {value.slice(index + highlight.length)}
    </>
  );
}
