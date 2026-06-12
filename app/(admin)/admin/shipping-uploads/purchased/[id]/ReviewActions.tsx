'use client';
import { ReviewActionPanel } from '@/components/admin/ReviewActionPanel';
import {
  approveShippingUploadAction,
  rejectShippingUploadAction,
} from '@/lib/actions/admin-shipping-uploads';

export function ReviewActions({ uploadId }: { uploadId: string }) {
  return (
    <ReviewActionPanel
      approveLabel="승인 (사입재고 차감)"
      approveSuccessTitle="승인 완료"
      approveSuccessDescription="입고완료 재고가 차감되었습니다. 예치금은 차감하지 않습니다."
      approve={() => approveShippingUploadAction(uploadId)}
      reject={(memo) => rejectShippingUploadAction(uploadId, memo)}
    />
  );
}
