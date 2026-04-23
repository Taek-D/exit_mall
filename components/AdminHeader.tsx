'use client';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, Menu, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MobileAdminNav } from '@/components/MobileAdminNav';

const TITLES: Record<string, string> = {
  '/admin': '대시보드',
  '/admin/approvals': '가입 승인',
  '/admin/deposits': '입금 확인',
  '/admin/orders': '주문 관리',
  '/admin/products': '상품 관리',
  '/admin/users': '사용자 관리',
  '/admin/low-balance': '잔액 부족 고객',
  '/admin/settings': '설정',
};

export function AdminHeader({ name, email }: { name: string; email?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([p]) => pathname.startsWith(p + '/'))?.[1] ??
    '관리자';
  const initial = (name || email || 'A').charAt(0).toUpperCase();

  return (
    <header className="h-16 shrink-0 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="메뉴"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-heading font-semibold text-lg tracking-tight">{title}</h1>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-9 px-2 rounded-md hover:bg-muted transition-colors duration-150"
              aria-label="사용자 메뉴"
            >
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-medium">
                {initial}
              </span>
              <span className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-sm font-medium">{name}</span>
                {email && <span className="text-[11px] text-muted-foreground">{email}</span>}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{name}</p>
              {email && <p className="text-xs text-muted-foreground">{email}</p>}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/settings">
                <span>설정</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logoutAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full cursor-pointer">
                  <LogOut className="h-4 w-4" aria-hidden />
                  <span>로그아웃</span>
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MobileAdminNav open={open} onOpenChange={setOpen} />
    </header>
  );
}
