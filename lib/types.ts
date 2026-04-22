export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type OrderStatus = 'placed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type DepositStatus = 'pending' | 'confirmed' | 'rejected';
export type BalanceTxType = 'deposit' | 'order' | 'refund' | 'adjust';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: '접수', preparing: '준비중', shipped: '배송중', delivered: '완료', cancelled: '취소',
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: '승인대기', confirmed: '반영완료', rejected: '반려',
};
