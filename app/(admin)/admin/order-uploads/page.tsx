import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import { OrderUploadStatusBadge } from '@/components/StatusBadge';
import { ChevronRight, Inbox, FileSpreadsheet } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토 대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
];

type UploadRow = {
  id: string;
  user_id: string;
  original_name: string;
  status: string;
  company_name: string | null;
  contact_person: string | null;
  total_quantity: number;
  total_amount: number;
  created_at: string;
  profiles: { name: string } | null;
};

export default async function AdminOrderUploadsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = searchParams.status ?? 'all';

  let q = supabase
    .from('order_uploads')
    .select(
      'id,user_id,original_name,status,company_name,contact_person,total_quantity,total_amount,created_at,profiles!order_uploads_user_id_fkey(name)',
    )
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as UploadRow[];

  const { data: allForCounts } = await supabase.from('order_uploads').select('status');
  const counts = ((allForCounts ?? []) as { status: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">주문서 업로드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            전체 {counts.all ?? 0}건 · 검토 대기 {counts.pending ?? 0}건
          </p>
        </div>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const active = status === t.key;
              const c = counts[t.key] ?? 0;
              return (
                <Link
                  key={t.key}
                  href={`/admin/order-uploads${t.key === 'all' ? '' : `?status=${t.key}`}`}
                  className={cn(
                    'relative flex items-center gap-2 px-4 h-11 text-sm border-b-2 transition-colors whitespace-nowrap',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-mono tabular',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {c}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">업로드된 주문서가 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-4 h-10">파일</th>
                  <th className="font-medium px-3">고객</th>
                  <th className="font-medium px-3">상호</th>
                  <th className="font-medium px-3 text-right">수량</th>
                  <th className="font-medium px-3 text-right">금액</th>
                  <th className="font-medium px-3">상태</th>
                  <th className="font-medium px-3">업로드</th>
                  <th className="font-medium px-3 w-8" aria-label="이동"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t h-11 hover:bg-surface-muted/60 transition-colors">
                    <td className="px-4">
                      <Link
                        href={`/admin/order-uploads/${u.id}`}
                        className="inline-flex items-center gap-1.5 text-accent hover:underline"
                        title={u.original_name}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                        <span className="truncate max-w-[180px]">{u.original_name}</span>
                      </Link>
                    </td>
                    <td className="px-3">
                      {u.profiles?.name ?? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {u.user_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-muted-foreground truncate max-w-[160px]">
                      {u.company_name ?? '—'}
                    </td>
                    <td className="px-3 text-right font-mono tabular">
                      {u.total_quantity.toLocaleString()}
                    </td>
                    <td className="px-3 text-right font-mono tabular">
                      {formatKRW(Number(u.total_amount))}
                    </td>
                    <td className="px-3">
                      <OrderUploadStatusBadge status={u.status} />
                    </td>
                    <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 text-right">
                      <Link
                        href={`/admin/order-uploads/${u.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="상세 보기"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
