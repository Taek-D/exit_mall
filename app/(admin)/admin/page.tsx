import Link from 'next/link';
import {
  ArrowRight,
  FileSpreadsheet,
  Inbox,
  LifeBuoy,
  ShoppingCart,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AdminDashboardRealtime } from '@/components/AdminDashboardRealtime';
import { StatCard } from '@/components/StatCard';
import {
  fetchAdminDashboardData,
  type AdminDashboardIconKey,
} from '@/lib/admin/dashboard';
import { formatShortDateTimeKR } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const ICONS: Record<AdminDashboardIconKey, LucideIcon> = {
  'user-check': UserCheck,
  wallet: Wallet,
  'shopping-cart': ShoppingCart,
  'file-spreadsheet': FileSpreadsheet,
  inbox: Inbox,
  'life-buoy': LifeBuoy,
};

const QUICK_LINKS = [
  { href: '/admin/approvals', label: '가입 승인', Icon: UserCheck },
  { href: '/admin/deposits', label: '입금 확인', Icon: Wallet },
  { href: '/admin/orders?status=pending', label: '구매 승인', Icon: ShoppingCart },
  {
    href: '/admin/shipping-uploads/exitmall?status=pending',
    label: '엑시트몰 배송대행',
    Icon: FileSpreadsheet,
  },
  {
    href: '/admin/shipping-uploads/purchased?status=pending',
    label: '사입재고 배송대행',
    Icon: FileSpreadsheet,
  },
  { href: '/admin/inbound-requests?status=open', label: '입고리스트', Icon: Inbox },
  { href: '/admin/support-requests?status=open', label: 'CS 문의', Icon: LifeBuoy },
];

export default async function AdminDashboard() {
  const dashboard = await fetchAdminDashboardData();

  return (
    <div className="space-y-6">
      <AdminDashboardRealtime />

      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          관리자 대시보드
        </h1>
        <p className="text-sm text-muted-foreground">
          대기 업무 {dashboard.totalPendingCount.toLocaleString('ko-KR')}건
          {dashboard.unreadAttentionCount > 0 && (
            <>
              {' · '}
              미확인 답변 {dashboard.unreadAttentionCount.toLocaleString('ko-KR')}건
            </>
          )}
        </p>
      </header>

      <section aria-label="오늘 처리할 일" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">오늘 처리할 일</h2>
          <span className="text-xs text-muted-foreground">현재 대기 총량 기준</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.workQueues.map((queue) => {
            const Icon = ICONS[queue.icon];
            const secondaryHint =
              queue.secondaryCount && queue.secondaryCount > 0
                ? `${queue.secondaryLabel} ${queue.secondaryCount.toLocaleString('ko-KR')}건`
                : undefined;
            return (
              <StatCard
                key={queue.key}
                label={queue.label}
                value={queue.count}
                href={queue.href}
                Icon={Icon}
                tone={queue.tone}
                hint={queue.description}
                secondaryHint={secondaryHint}
              />
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-lg border bg-card">
          <header className="flex h-14 items-center justify-between border-b px-5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <h2 className="font-heading text-[15px] font-semibold">최근 업무 이벤트</h2>
              <span className="text-[11px] text-muted-foreground">최근 15건</span>
            </div>
          </header>

          {dashboard.recentActivities.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              최근 업무 이벤트가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* 표를 줄이지 말고 가로로 스크롤시킨다(docs/standards.md). */}
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="h-10 px-5 font-medium">업무</th>
                    <th className="px-3 font-medium w-full">내용</th>
                    <th className="px-3 font-medium">고객</th>
                    <th className="px-3 font-medium">상태</th>
                    <th className="px-3 font-medium">시간</th>
                    <th className="w-8 px-3" aria-label="이동" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentActivities.map((activity) => (
                    <tr
                      key={activity.id}
                      className="h-11 border-t transition-colors hover:bg-surface-muted/60"
                    >
                      <td className="whitespace-nowrap px-5 text-xs font-medium">
                        {activity.type}
                      </td>
                      <td className="max-w-[260px] truncate px-3">
                        <Link href={activity.href} className="hover:underline">
                          {activity.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 text-muted-foreground">
                        {activity.customerName ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 text-muted-foreground">
                        {activity.statusLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 text-xs text-muted-foreground">
                        {formatShortDateTimeKR(activity.occurredAt)}
                      </td>
                      <td className="px-3 text-right">
                        <Link
                          href={activity.href}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="상세 보기"
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-lg border bg-card">
          <header className="flex h-14 items-center justify-between border-b px-5">
            <h2 className="font-heading text-[15px] font-semibold">빠른 이동</h2>
          </header>
          <ul className="p-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-11 items-center justify-between gap-3 rounded-md px-3 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {label}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
