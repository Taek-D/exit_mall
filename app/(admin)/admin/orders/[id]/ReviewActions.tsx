'use client';
import { ReviewActionPanel } from '@/components/admin/ReviewActionPanel';
import {
  approveStockOrderAction,
  rejectStockOrderAction,
} from '@/lib/actions/admin-stock-orders';

export function ReviewActions({ orderId }: { orderId: string }) {
  return (
    <ReviewActionPanel
      approveLabel="승인 (재고 적립 + 예치금 차감)"
      approveSuccessTitle="승인되었습니다"
      approveSuccessDescription="보유 재고에 적립되었습니다."
      approve={() => approveStockOrderAction(orderId)}
      reject={(memo) => rejectStockOrderAction(orderId, memo)}
    />
  );
}
