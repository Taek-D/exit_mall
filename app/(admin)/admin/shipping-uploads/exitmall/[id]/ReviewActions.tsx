'use client';
import { ReviewActionPanel } from '@/components/admin/ReviewActionPanel';
import {
  approveShippingUploadAction,
  rejectShippingUploadAction,
} from '@/lib/actions/admin-shipping-uploads';

export function ReviewActions({ uploadId }: { uploadId: string }) {
  return (
    <ReviewActionPanel
      approveLabel="승인 (재고 차감)"
      approveSuccessTitle="승인 완료"
      approveSuccessDescription="보유 재고가 차감되었습니다. 배송비는 예치금에서 차감하지 않습니다."
      approve={() => approveShippingUploadAction(uploadId)}
      reject={(memo) => rejectShippingUploadAction(uploadId, memo)}
    />
  );
}
