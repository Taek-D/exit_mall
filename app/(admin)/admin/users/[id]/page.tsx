import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import Link from 'next/link';
import { BalanceAdjustForm } from './BalanceAdjustForm';
import { UserStatusButtons } from './UserStatusButtons';
import { ThresholdForm } from './ThresholdForm';
import { GroupChangeForm } from './GroupChangeForm';
import type { UserGroup } from '@/lib/auth/user-groups';
import {
  UserStatusBadge,
  OrderStatusBadge,
  DepositStatusBadge,
  StockOrderStatusBadge,
  ShippingUploadStatusBadge,
  StatusPill,
} from '@/components/StatusBadge';
import type {
  UserStatus,
  OrderStatus,
  DepositStatus,
  BalanceTxType,
  StockOrderStatus,
  ShippingUploadStatus,
} from '@/lib/types';
import { ArrowLeft, TrendingDown, TrendingUp, Boxes } from 'lucide-react';
import { InventoryAdjuster } from './InventoryAdjuster';
import { CustomInventoryManager } from './CustomInventoryManager';
import { formatDateTimeKR } from '@/lib/dates';
import {
  fetchAdminUserDetail,
  getInventoryProductName,
  isPositiveTransaction,
} from '@/lib/admin/user-detail';
import { HistoryTable, Metric } from '@/components/admin/DetailPanels';

export const dynamic = 'force-dynamic';

const TX_LABEL: Record<BalanceTxType, string> = {
  deposit: '입금',
  order: '주문',
  refund: '환불',
  adjust: '조정',
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await fetchAdminUserDetail(params.id);
  if (!detail) notFound();

  const {
    profile: user,
    orders,
    deposits,
    transactions,
    inventory,
    customInventory,
    products,
    totalSpent,
  } = detail;
  const initial = (user.name || '?').charAt(0).toUpperCase();

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        사용자 목록
      </Link>

      <header className="rounded-lg border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center shrink-0">
            <span className="text-lg font-medium">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-semibold text-xl tracking-tight">{user.name}</h1>
              <UserStatusBadge status={user.status as UserStatus} />
              {user.role === 'admin' && <StatusPill tone="info">관리자</StatusPill>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{user.email}</span>
              <span className="font-mono tabular">{user.phone}</span>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="잔액" value={formatKRW(Number(user.deposit_balance))} highlight />
          <Metric label="상품 사용액" value={formatKRW(totalSpent)} />
          <Metric label="임계치" value={formatKRW(Number(user.low_balance_threshold))} />
          <Metric label="누적 거래" value={`${orders.length}건`} />
        </dl>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <BalanceAdjustForm userId={user.id} />
        <ThresholdForm userId={user.id} defaultValue={Number(user.low_balance_threshold)} />
        <UserStatusButtons userId={user.id} status={user.status as UserStatus} />
        {user.role !== 'admin' && (
          <GroupChangeForm
            userId={user.id}
            currentGroup={(user.user_group ?? null) as UserGroup | null}
            status={user.status}
          />
        )}
      </section>

      <section className="rounded-lg border bg-card">
        <header className="h-11 px-5 flex items-center gap-2 border-b">
          <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading font-semibold text-sm">보유 재고</h2>
        </header>
        <ul className="p-5 space-y-2 text-sm">
          {inventory.length === 0 && customInventory.length === 0 && (
            <li className="text-muted-foreground">보유 재고가 없습니다.</li>
          )}
          {inventory.map((row) => (
            <li key={`p-${row.product_id}`} className="flex justify-between">
              <span>{getInventoryProductName(row)}</span>
              <span className="font-mono tabular">{row.quantity}</span>
            </li>
          ))}
          {customInventory
            .filter((row) => row.quantity > 0)
            .map((row) => (
              <li key={`c-${row.id}`} className="flex justify-between">
                <span>
                  {row.name} <span className="text-xs text-muted-foreground">(수기)</span>
                </span>
                <span className="font-mono tabular">{row.quantity}</span>
              </li>
            ))}
        </ul>
      </section>

      <InventoryAdjuster userId={user.id} products={products} />
      <CustomInventoryManager userId={user.id} rows={customInventory} />

      <Tabs defaultValue="orders" className="space-y-3">
        <TabsList>
          <TabsTrigger value="orders">주문 이력</TabsTrigger>
          <TabsTrigger value="deposits">이체 이력</TabsTrigger>
          <TabsTrigger value="ledger">원장</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['종류', '식별', '금액', '상태', '시간']}
            rightAligned={[2]}
            rows={orders.map((row) => {
              const shippingSubKind = row.shippingKind ?? 'exitmall';
              const kindLabel =
                row.kind === 'stock_order'
                  ? '엑시트몰 구매'
                  : row.kind === 'shipping_upload'
                    ? shippingSubKind === 'purchased'
                      ? '배송대행 (사입재고)'
                      : '배송대행'
                    : 'Legacy';
              const statusBadge =
                row.kind === 'stock_order' ? (
                  <StockOrderStatusBadge status={row.status as StockOrderStatus} />
                ) : row.kind === 'shipping_upload' ? (
                  <ShippingUploadStatusBadge status={row.status as ShippingUploadStatus} />
                ) : (
                  <OrderStatusBadge status={row.status as OrderStatus} />
                );
              const idHref =
                row.kind === 'shipping_upload'
                  ? shippingSubKind === 'purchased'
                    ? `/admin/shipping-uploads/purchased/${row.id}`
                    : `/admin/shipping-uploads/exitmall/${row.id}`
                  : row.kind === 'legacy'
                    ? `/admin/orders-legacy/${row.id}`
                    : `/admin/orders/${row.id}`;
              return [
                <span key="k" className="text-xs">
                  {kindLabel}
                </span>,
                <Link
                  key="id"
                  href={idHref}
                  className="text-xs text-accent hover:underline truncate inline-block max-w-[180px] align-middle"
                >
                  {row.summary}
                </Link>,
                <span key="a" className="font-mono tabular">
                  {formatKRW(row.amount)}
                </span>,
                statusBadge,
                <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTimeKR(row.created_at)}
                </span>,
              ];
            })}
          />
        </TabsContent>

        <TabsContent value="deposits" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['금액', '입금자명', '상태', '시간']}
            rightAligned={[0]}
            rows={deposits.map((deposit) => [
              <span key="a" className="font-mono tabular">
                {formatKRW(Number(deposit.amount))}
              </span>,
              deposit.depositor_name,
              <DepositStatusBadge key="s" status={deposit.status as DepositStatus} />,
              <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTimeKR(deposit.created_at)}
              </span>,
            ])}
          />
        </TabsContent>

        <TabsContent value="ledger" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['종류', '증감', '잔액', '메모', '시간']}
            rightAligned={[1, 2]}
            rows={transactions.map((tx) => {
              const positive = isPositiveTransaction(tx);
              return [
                <span key="type" className="text-xs">
                  {TX_LABEL[tx.type as BalanceTxType] ?? tx.type}
                </span>,
                <span
                  key="delta"
                  className={`inline-flex items-center gap-1 font-mono tabular ${
                    positive ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {positive ? (
                    <TrendingUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden />
                  )}
                  {formatKRW(Number(tx.amount))}
                </span>,
                <span key="bal" className="font-mono tabular text-muted-foreground">
                  {formatKRW(Number(tx.balance_after))}
                </span>,
                <span key="m" className="text-xs text-muted-foreground">
                  {tx.memo ?? '-'}
                </span>,
                <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTimeKR(tx.created_at)}
                </span>,
              ];
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
