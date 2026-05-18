'use client';
import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  Wallet,
  ShoppingBag,
  Package,
  LogOut,
  Upload,
  KeyRound,
  Boxes,
  Inbox,
  LifeBuoy,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
import { SupportUnreadBadge } from '@/components/support/SupportUnreadBadge';
import type { UserGroup } from '@/lib/auth/user-groups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Package;
  exact?: boolean;
  groups: readonly UserGroup[];
};

type ShippingNavItem = NavItem & {
  description: string;
};

const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/shop', label: '상품', Icon: Package, groups: ['group1'] },
  { href: '/inventory', label: '보유 재고', Icon: Boxes, groups: ['group1'] },
  { href: '/inbound-requests', label: '입고리스트', Icon: Inbox, groups: ['group1', 'group2'] },
  { href: '/support-requests', label: '문의', Icon: LifeBuoy, groups: ['group1', 'group2'] },
  { href: '/guide', label: '가이드', Icon: BookOpen, groups: ['group1', 'group2'] }
];

const SHIPPING_NAV: readonly ShippingNavItem[] = [
  {
    href: '/shipping-uploads/exitmall',
    label: '엑시트몰 배송대행',
    description: '엑시트몰에서 구매한 재고 발송',
    Icon: Upload,
    groups: ['group1'],
  },
  {
    href: '/shipping-uploads/purchased',
    label: '사입재고 배송대행',
    description: '직접 사입한 재고 발송',
    Icon: Upload,
    groups: ['group1', 'group2'],
  },
];

function getNavLabelLines(label: string) {
  if (label.length > 5) return [label.slice(0, 5), label.slice(5)];
  return [label];
}

function NavLabel({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center leading-tight whitespace-nowrap">
      {getNavLabelLines(label).map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
}

export function NavUser({
  balance,
  name,
  inboundUnread,
  supportUnread,
  userGroup,
}: {
  balance: number;
  name: string;
  inboundUnread: number;
  supportUnread: number;
  userGroup: UserGroup;
}) {
  const pathname = usePathname();
  const initial = (name || 'U').charAt(0).toUpperCase();
  const visibleNav = PRIMARY_NAV.filter((item) => item.groups.includes(userGroup));
  const visibleShippingNav = SHIPPING_NAV.filter((item) => item.groups.includes(userGroup));
  const isGroup2 = userGroup === 'group2';
  const homeHref = isGroup2 ? '/shipping-uploads/purchased' : '/shop';
  const shippingActive = visibleShippingNav.some((item) => isActivePath(pathname, item.href));

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-5 lg:gap-6">
          <Link href={homeHref} className="flex shrink-0 items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
              <span className="text-primary-foreground text-xs font-heading font-semibold">E</span>
            </div>
            <span className="font-heading font-semibold tracking-tight hidden sm:inline">엑시트몰</span>
          </Link>
          <nav className="hidden md:flex min-w-0 items-center gap-1">
            {visibleNav.map(({ href, label, Icon, exact }) => {
              const active = isActivePath(pathname, href, exact);
              const shouldRenderShipping = href === '/inbound-requests' && visibleShippingNav.length > 0;
              return (
                <Fragment key={href}>
                  {shouldRenderShipping && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-current={shippingActive ? 'page' : undefined}
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 px-2.5 lg:px-3 min-h-9 py-1 rounded-md text-sm transition-colors duration-150',
                            shippingActive
                              ? 'bg-muted text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                          )}
                        >
                          <Upload className="h-4 w-4 shrink-0" aria-hidden />
                          <span>배송대행</span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 p-1.5">
                        {visibleShippingNav.map(({ href: shippingHref, label: shippingLabel, description }) => (
                          <DropdownMenuItem key={shippingHref} asChild className="items-start gap-3 rounded-md p-3">
                            <Link href={shippingHref}>
                              <Upload className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
                              <span className="grid gap-0.5">
                                <span className="font-medium text-foreground">{shippingLabel}</span>
                                <span className="text-xs text-muted-foreground">{description}</span>
                              </span>
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 px-2.5 lg:px-3 min-h-9 py-1 rounded-md text-sm transition-colors duration-150',
                      active
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="inline-flex min-w-max items-center gap-1">
                      <NavLabel label={label} />
                      {href === '/inbound-requests' && (
                        <InboundUnreadBadge role="user" initial={inboundUnread} />
                      )}
                      {href === '/support-requests' && (
                        <SupportUnreadBadge role="user" initial={supportUnread} />
                      )}
                    </span>
                  </Link>
                </Fragment>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!isGroup2 && (
            <Link
              href="/cart"
              className="inline-flex h-8 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              aria-label="장바구니"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
            </Link>
          )}
          {!isGroup2 && (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 text-accent"
              aria-label={`보유 예치금 ${formatKRW(balance)}`}
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono text-sm tabular">{formatKRW(balance)}</span>
            </div>
          )}
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
                {!isGroup2 && (
                  <p className="text-xs text-muted-foreground sm:hidden font-mono tabular mt-0.5">
                    {formatKRW(balance)}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              {!isGroup2 && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/deposit">예치금 관리</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/orders">주문 내역</Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href="/account/password">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  <span>비밀번호 변경</span>
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
      </div>

      {/* mobile bottom strip for primary nav */}
      <nav className="md:hidden border-t overflow-x-auto">
        <ul className="mx-auto flex min-w-full max-w-7xl px-2">
          {visibleNav.map(({ href, label, Icon, exact }) => {
            const active = isActivePath(pathname, href, exact);
            const shouldRenderShipping = href === '/inbound-requests' && visibleShippingNav.length > 0;
            return (
              <Fragment key={href}>
                {shouldRenderShipping && (
                  <li className="w-20 flex-none">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-current={shippingActive ? 'page' : undefined}
                          className={cn(
                            'flex h-12 w-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                            shippingActive ? 'text-foreground font-medium' : 'text-muted-foreground',
                          )}
                        >
                          <Upload className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="inline-flex items-center gap-0.5">
                            배송대행
                            <ChevronDown className="h-3 w-3" aria-hidden />
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-64 p-1.5">
                        {visibleShippingNav.map(({ href: shippingHref, label: shippingLabel, description }) => (
                          <DropdownMenuItem key={shippingHref} asChild className="items-start gap-3 rounded-md p-3">
                            <Link href={shippingHref}>
                              <Upload className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
                              <span className="grid gap-0.5">
                                <span className="font-medium text-foreground">{shippingLabel}</span>
                                <span className="text-xs text-muted-foreground">{description}</span>
                              </span>
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )}
                <li className="w-20 flex-none">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 h-12 text-[11px] transition-colors',
                      active ? 'text-foreground font-medium' : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="inline-flex items-center gap-1">
                      <NavLabel label={label} />
                      {href === '/inbound-requests' && (
                        <InboundUnreadBadge role="user" initial={inboundUnread} />
                      )}
                      {href === '/support-requests' && (
                        <SupportUnreadBadge role="user" initial={supportUnread} />
                      )}
                    </span>
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
