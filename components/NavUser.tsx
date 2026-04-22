import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';

export function NavUser({ balance, name }: { balance: number; name: string }) {
  return (
    <nav className="border-b bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/shop" className="font-bold">엑시트몰</Link>
          <Link href="/shop" className="text-sm hover:underline">상품</Link>
          <Link href="/cart" className="text-sm hover:underline">장바구니</Link>
          <Link href="/orders" className="text-sm hover:underline">주문내역</Link>
          <Link href="/deposit" className="text-sm hover:underline">예치금</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-semibold">{formatKRW(balance)}</span>
          <form action={logoutAction}><Button type="submit" variant="ghost" size="sm">로그아웃</Button></form>
        </div>
      </div>
    </nav>
  );
}
