import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export function NavAdmin({ name }: { name: string }) {
  return (
    <nav className="border-b bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="font-bold">엑시트몰 관리자</Link>
          <Link href="/admin" className="text-sm hover:underline">대시보드</Link>
          <Link href="/admin/approvals" className="text-sm hover:underline">가입승인</Link>
          <Link href="/admin/deposits" className="text-sm hover:underline">입금확인</Link>
          <Link href="/admin/orders" className="text-sm hover:underline">주문관리</Link>
          <Link href="/admin/products" className="text-sm hover:underline">상품관리</Link>
          <Link href="/admin/users" className="text-sm hover:underline">사용자</Link>
          <Link href="/admin/low-balance" className="text-sm hover:underline">잔액부족</Link>
          <Link href="/admin/settings" className="text-sm hover:underline">설정</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>{name}</span>
          <form action={logoutAction}><Button type="submit" variant="secondary" size="sm">로그아웃</Button></form>
        </div>
      </div>
    </nav>
  );
}
