export const USER_FAQ_CATEGORIES = [
  'getting-started',
  'purchase',
  'shipping-upload',
  'inventory',
  'inbound',
  'deposit',
  'account',
] as const;

export const ADMIN_FAQ_CATEGORIES = [
  'getting-started',
  'approvals',
  'deposits',
  'products',
  'orders',
  'shipping-upload',
  'inbound',
  'users',
  'etc',
] as const;

export type UserFaqCategory = (typeof USER_FAQ_CATEGORIES)[number];
export type AdminFaqCategory = (typeof ADMIN_FAQ_CATEGORIES)[number];

export const USER_FAQ_CATEGORY_LABEL: Record<UserFaqCategory, string> = {
  'getting-started': '시작하기',
  purchase: '상품 구매',
  'shipping-upload': '배송대행',
  inventory: '보유 재고',
  inbound: '입고 요청',
  deposit: '예치금',
  account: '계정',
};

export const ADMIN_FAQ_CATEGORY_LABEL: Record<AdminFaqCategory, string> = {
  'getting-started': '시작하기',
  approvals: '가입 승인',
  deposits: '입금',
  products: '상품',
  orders: '주문',
  'shipping-upload': '배송대행',
  inbound: '입고 요청',
  users: '사용자',
  etc: '기타',
};

export function isUserFaqCategory(v: unknown): v is UserFaqCategory {
  return typeof v === 'string' && (USER_FAQ_CATEGORIES as readonly string[]).includes(v);
}

export function isAdminFaqCategory(v: unknown): v is AdminFaqCategory {
  return typeof v === 'string' && (ADMIN_FAQ_CATEGORIES as readonly string[]).includes(v);
}
