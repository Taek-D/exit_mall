export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type OrderStatus = 'placed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type DepositStatus = 'pending' | 'confirmed' | 'rejected';
export type BalanceTxType = 'deposit' | 'order' | 'refund' | 'adjust';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: '접수', preparing: '준비중', shipped: '배송중', delivered: '완료', cancelled: '취소',
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: '승인대기', confirmed: '반영완료', rejected: '반려',
};

export type StockOrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ShippingUploadStatus =
  | 'pending' | 'approved' | 'rejected' | 'failed'
  | 'shipped' | 'completed' | 'cancelled';

export const STOCK_ORDER_STATUS_LABEL: Record<StockOrderStatus, string> = {
  pending: '검토대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
};

export const SHIPPING_UPLOAD_STATUS_LABEL: Record<ShippingUploadStatus, string> = {
  pending: '검토대기',
  approved: '승인',
  rejected: '반려',
  failed: '오류',
  shipped: '발송중',
  completed: '완료',
  cancelled: '취소',
};
