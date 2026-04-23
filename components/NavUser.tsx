'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Wallet, ShoppingBag, ClipboardList, Package, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV = [
  { href: '/shop', label: '상품', Icon: Package },
  { href: '/cart', label: '장바구니', Icon: ShoppingBag },
  { href: '/orders', label: '주문 내역', Icon: ClipboardList },
  { href: '/deposit', label: '예치금', Icon: Wallet },
];

export function NavUser({ balance, name }: { balance: number; name: string }) {
  const pathname = usePathname();
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/shop" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
              <span className="text-primary-foreground text-xs font-heading font-semibold">E</span>
            </div>
            <span className="font-heading font-semibold tracking-tight hidden sm:inline">엑시트몰</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-9 rounded-md text-sm transition-colors duration-150',
                    active
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 text-accent"
            aria-label={`보유 예치금 ${formatKRW(balance)}`}
          >
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono text-sm tabular">{formatKRW(balance)}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-muted transition-colors"
                aria-label="계정"
              >
                <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-medium">
                  {initial}
                </span>
                <span className="hidden sm:inline text-sm text-muted-foreground max-w-[140px] truncate">{name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground sm:hidden font-mono tabular mt-0.5">
                  {formatKRW(balance)}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/deposit">예치금 관리</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/orders">주문 내역</Link>
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
      </div>

      {/* mobile bottom strip for primary nav */}
      <nav className="md:hidden border-t">
        <ul className="mx-auto max-w-7xl px-2 flex">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 h-12 text-[11px] transition-colors',
                    active ? 'text-foreground font-medium' : 'text-muted-foreground',
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
    </header>
  );
}
