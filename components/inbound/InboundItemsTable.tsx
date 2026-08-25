import { TrackingNumberCopy } from '@/components/inbound/TrackingNumberCopy';
import { groupInboundShipments } from '@/lib/inbound/tracking';
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
  // 송장 건수는 배송 정보 블록을 없애면서 이 제목으로 옮겼다. 송장이 하나뿐인
  // 요청이 55%인데 그때는 표에 한 줄로 보이므로 알려줄 게 없다. 여러 개일 때만
  // 노출해서(35%, 최대 23개) 열을 위아래로 세지 않아도 되게 한다.
  const { shipments } = groupInboundShipments(items);

  return (
    <div className="rounded-md border bg-background">
      <div className="px-3 py-2 border-b text-sm font-medium flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span>
          신청 품목 ({items.length}건 · 총 {totalQty}개
          {shipments.length > 1 && ` · 송장 ${shipments.length}건`})
        </span>
        {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
      </div>
      <div className="overflow-x-auto">
        {/* 표 전체를 nowrap으로 두고 좁아지면 가로로 스크롤시킨다. 그러지 않으면
            상품명이 길 때 브라우저가 수량·택배사 같은 좁은 열의 폭을 뺏어
            헤더가 "수/량", "택/배/사"처럼 글자 단위로 접힌다.
            남는 폭을 흡수하는 건 상품명 하나뿐이다. 옵션까지 normal로 풀면
            이번엔 옵션이 눌려 "실/버"처럼 접힌다. */}
        <table className="w-full min-w-[38rem] text-sm whitespace-nowrap">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-3 h-9 w-10 text-right">#</th>
              <th className="font-medium px-3 w-full">상품명</th>
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
                <td className="px-3 py-2 font-medium whitespace-normal">{item.product_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.option_name || '-'}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{item.quantity}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.carrier || '-'}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {item.tracking_number ? (
                    <TrackingNumberCopy value={item.tracking_number} />
                  ) : (
                    <span className="font-mono tabular">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
