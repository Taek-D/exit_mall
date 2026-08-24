import type { InboundRequestItem } from '@/lib/inbound/queries';
import type { InboundStatus } from '@/lib/types';

const STATUS_NOTE: Partial<Record<InboundStatus, string>> = {
  open: '관리자가 첨부 파일과 항목을 검토한 뒤 [완료] 처리하면 사입재고로 반영됩니다.',
  in_progress: '관리자가 첨부 파일과 항목을 검토 중입니다. [완료] 처리 시점에 사입재고로 반영됩니다.',
  completed: '아래 항목이 사입재고로 반영되었습니다.',
  cancelled: '취소된 요청이라 사입재고로 반영되지 않았습니다.',
};

export function InboundItemsTable({
  items,
  status,
}: {
  items: InboundRequestItem[];
  status: InboundStatus;
}) {
  if (!items.length) return null;
  const note = STATUS_NOTE[status];
  const totalQty = items.reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? Number(item.quantity) : 0),
    0,
  );

  return (
    <div className="rounded-md border bg-background">
      <div className="px-3 py-2 border-b text-sm font-medium flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span>신청 품목 ({items.length}건 · 총 {totalQty}개)</span>
        {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
      </div>
      <div className="overflow-x-auto">
        {/* 열이 6개라 좁은 화면에서는 표를 줄이지 않고 가로로 스크롤시킨다.
            min-width가 없으면 상품명이 한 글자씩 접힌다. */}
        <table className="w-full min-w-[38rem] text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-3 h-9 w-10 text-right">#</th>
              <th className="font-medium px-3">상품명</th>
              <th className="font-medium px-3">옵션</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3">택배사</th>
              <th className="font-medium px-3">송장번호</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.product_name}:${item.option_name ?? ''}:${index}`} className="border-t">
                <td className="px-3 py-2 text-right text-muted-foreground font-mono tabular">
                  {index + 1}
                </td>
                <td className="px-3 py-2 font-medium">{item.product_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.option_name || '-'}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{item.quantity}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {item.carrier || '-'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-mono tabular text-muted-foreground">
                  {item.tracking_number || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
