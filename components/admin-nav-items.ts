import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  FileSpreadsheet,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  exact?: boolean;
  muted?: boolean;
  mobile?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: '대시보드', Icon: LayoutDashboard, exact: true },
  { href: '/admin/approvals', label: '가입 승인', Icon: UserCheck },
  { href: '/admin/deposits', label: '입금 확인', Icon: Wallet },
  { href: '/admin/orders', label: '주문관리', Icon: ShoppingCart, exact: true },
  { href: '/admin/shipping-uploads/exitmall', label: '엑시트몰 배송대행', Icon: FileSpreadsheet },
  { href: '/admin/shipping-uploads/purchased', label: '사입재고 배송대행', Icon: FileSpreadsheet },
  { href: '/admin/inbound-requests', label: '입고리스트', Icon: Inbox },
  { href: '/admin/products', label: '상품 관리', Icon: Package },
  { href: '/admin/users', label: '사용자', Icon: Users },
  { href: '/admin/low-balance', label: '잔액 부족', Icon: AlertTriangle },
  { href: '/admin/guide', label: '관리자 가이드', Icon: BookOpen, exact: true },
  { href: '/admin/guide/faq/manage', label: 'FAQ 관리', Icon: HelpCircle },
  { href: '/admin/orders-legacy', label: 'Legacy 주문', Icon: Archive, muted: true, mobile: false },
  { href: '/admin/settings', label: '설정', Icon: Settings },
];
