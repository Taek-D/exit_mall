import { createClient } from '@/lib/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import Link from 'next/link';
import { BalanceAdjustForm } from './BalanceAdjustForm';
import { UserStatusButtons } from './UserStatusButtons';
import { ThresholdForm } from './ThresholdForm';
import {
  UserStatusBadge,
  OrderStatusBadge,
  DepositStatusBadge,
  StatusPill,
} from '@/components/StatusBadge';
import type { UserStatus, OrderStatus, DepositStatus, BalanceTxType } from '@/lib/types';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  deposit_balance: number;
  low_balance_threshold: number;
};
type Order = { id: string; total_amount: number; status: string; created_at: string };
type DepositReq = {
  id: string;
  amount: number;
  depositor_name: string;
  status: string;
  created_at: string;
};
type BalTx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  memo: string | null;
  created_at: string;
};

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
  const supabase = createClient();
  const [{ data: u }, { data: orders }, { data: deposits }, { data: txs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).single<Profile>(),
    supabase
      .from('orders')
      .select('id,total_amount,status,created_at')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('deposit_requests')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('balance_transactions')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false }),
  ]);
  if (!u) notFound();

  const ol = (orders ?? []) as unknown as Order[];
  const dl = (deposits ?? []) as unknown as DepositReq[];
  const tl = (txs ?? []) as unknown as BalTx[];
  const totalSpent = ol
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + Number(o.total_amount), 0);

  const initial = (u.name || '?').charAt(0).toUpperCase();

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
              <h1 className="font-heading font-semibold text-xl tracking-tight">{u.name}</h1>
              <UserStatusBadge status={u.status as UserStatus} />
              {u.role === 'admin' && <StatusPill tone="info">관리자</StatusPill>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{u.email}</span>
              <span className="font-mono tabular">{u.phone}</span>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="잔액" value={formatKRW(Number(u.deposit_balance))} highlight />
          <Metric label="총 사용액" value={formatKRW(totalSpent)} />
          <Metric label="임계치" value={formatKRW(Number(u.low_balance_threshold))} />
          <Metric label="누적 주문" value={`${ol.length}건`} />
        </dl>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BalanceAdjustForm userId={u.id} />
        <ThresholdForm userId={u.id} defaultValue={Number(u.low_balance_threshold)} />
        <UserStatusButtons userId={u.id} status={u.status as UserStatus} />
      </section>

      <Tabs defaultValue="orders" className="space-y-3">
        <TabsList>
          <TabsTrigger value="orders">주문 이력</TabsTrigger>
          <TabsTrigger value="deposits">이체 이력</TabsTrigger>
          <TabsTrigger value="ledger">원장</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['주문번호', '금액', '상태', '시간']}
            rightAligned={[1]}
            rows={ol.map((o) => [
              <span key="n" className="font-mono text-xs text-muted-foreground">
                {o.id.slice(0, 8)}
              </span>,
              <span key="a" className="font-mono tabular">
                {formatKRW(Number(o.total_amount))}
              </span>,
              <OrderStatusBadge key="s" status={o.status as OrderStatus} />,
              <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(o.created_at).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>,
            ])}
          />
        </TabsContent>

        <TabsContent value="deposits" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['금액', '입금자명', '상태', '시간']}
            rightAligned={[0]}
            rows={dl.map((d) => [
              <span key="a" className="font-mono tabular">
                {formatKRW(Number(d.amount))}
              </span>,
              d.depositor_name,
              <DepositStatusBadge key="s" status={d.status as DepositStatus} />,
              <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(d.created_at).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>,
            ])}
          />
        </TabsContent>

        <TabsContent value="ledger" className="rounded-lg border bg-card overflow-hidden m-0">
          <HistoryTable
            headers={['종류', '증감', '잔액', '메모', '시간']}
            rightAligned={[1, 2]}
            rows={tl.map((t) => {
              const positive = Number(t.amount) >= 0;
              return [
                <span key="type" className="text-xs">
                  {TX_LABEL[t.type as BalanceTxType] ?? t.type}
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
                  {formatKRW(Number(t.amount))}
                </span>,
                <span key="bal" className="font-mono tabular text-muted-foreground">
                  {formatKRW(Number(t.balance_after))}
                </span>,
                <span key="m" className="text-xs text-muted-foreground">
                  {t.memo ?? '—'}
                </span>,
                <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(t.created_at).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>,
              ];
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono tabular ${
          highlight ? 'text-xl font-semibold' : 'text-base'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function HistoryTable({
  headers,
  rows,
  rightAligned = [],
}: {
  headers: string[];
  rows: React.ReactNode[][];
  rightAligned?: number[];
}) {
  if (rows.length === 0) {
    return <div className="p-10 text-center text-sm text-muted-foreground">기록이 없습니다.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`font-medium px-3 h-10 ${
                  rightAligned.includes(i) ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t h-11 hover:bg-surface-muted/50 transition-colors">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 ${rightAligned.includes(ci) ? 'text-right' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
