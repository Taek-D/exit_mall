/**
 * 도메인별 revalidate 경로 상수 + 헬퍼.
 *
 * 액션 전반에서 반복되는 경로 그룹(admin-shipping-uploads의 12-path, support의
 * 4-path, inbound의 4-path 등)을 한 곳에서 관리한다.
 *
 * 사용 예:
 *   revalidatePaths(shippingUploadAllPaths());
 *   revalidatePaths(supportDetailPaths(requestId));
 */
import { revalidatePath } from 'next/cache';

export function revalidatePaths(paths: string[]): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}

/** 관리자/사용자 양쪽 배송 업로드 12경로. approve/reject/complete/attach-tracking 공용. */
export function shippingUploadAllPaths(): string[] {
  return [
    '/admin/shipping-uploads',
    '/admin/shipping-uploads/exitmall',
    '/admin/shipping-uploads/purchased',
    '/shipping-uploads',
    '/shipping-uploads/exitmall',
    '/shipping-uploads/purchased',
  ];
}

/** 송장 첨부 액션 전용 — 특정 uploadId 상세 경로까지 포함. */
export function adminTrackingPaths(uploadId: string): string[] {
  return [
    `/admin/shipping-uploads/exitmall/${uploadId}`,
    `/admin/shipping-uploads/purchased/${uploadId}`,
    `/admin/shipping-uploads/${uploadId}`,
    `/shipping-uploads/exitmall/${uploadId}`,
    `/shipping-uploads/purchased/${uploadId}`,
    `/shipping-uploads/${uploadId}`,
    ...shippingUploadAllPaths(),
  ];
}

/** support request 상세/목록 4경로. */
export function supportDetailPaths(requestId: string): string[] {
  return [
    '/support-requests',
    `/support-requests/${requestId}`,
    '/admin/support-requests',
    `/admin/support-requests/${requestId}`,
  ];
}

/** inbound request 상세/목록 4경로. */
export function inboundDetailPaths(requestId: string): string[] {
  return [
    '/inbound-requests',
    `/inbound-requests/${requestId}`,
    '/admin/inbound-requests',
    `/admin/inbound-requests/${requestId}`,
  ];
}

/** inbound request 목록 2경로 (생성/삭제 시). */
export function inboundListPaths(): string[] {
  return ['/inbound-requests', '/admin/inbound-requests'];
}
