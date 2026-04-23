'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  UserCheck,
  Wallet,
  ShoppingCart,
  Package,
  Users,
  AlertTriangle,
  Settings,
} from 'lucide-react';

const NAV = [
  { href: '/admin', label: '대시보드', Icon: LayoutDashboard, exact: true },
  { href: '/admin/approvals', label: '가입 승인', Icon: UserCheck },
  { href: '/admin/deposits', label: '입금 확인', Icon: Wallet },
  { href: '/admin/orders', label: '주문 관리', Icon: ShoppingCart },
  { href: '/admin/products', label: '상품 관리', Icon: Package },
  { href: '/admin/users', label: '사용자', Icon: Users },
  { href: '/admin/low-balance', label: '잔액 부족', Icon: AlertTriangle },
  { href: '/admin/settings', label: '설정', Icon: Settings },
];

export function MobileAdminNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pathname = usePathname();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs p-0 gap-0 translate-x-0 left-0 top-0 h-screen w-72 max-h-none rounded-none data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
        <DialogTitle className="sr-only">관리자 메뉴</DialogTitle>
        <div className="h-16 flex items-center gap-2 px-6 border-b">
          <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-xs font-heading font-semibold">E</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-heading font-semibold text-sm">엑시트몰</span>
            <span className="text-[11px] text-muted-foreground">관리자 콘솔</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-0.5">
            {NAV.map(({ href, label, Icon, exact }) => {
              const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 h-10 rounded-md text-sm transition-colors',
                      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
