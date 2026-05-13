import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, Wrench, Trash2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  admin_adjust: '관리자 조정',
  admin_delete: '관리자 삭제',
  shipping_upload_approved: '배송대행 승인',
};

type Movement = {
  id: string;
  delta: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
};

export default async function CustomInventoryTimeline({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>;

  const { data: row } = await supabase
    .from('user_custom_inventory')
    .select('id, name, quantity')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; name: string; quantity: number }>();
  if (!row) notFound();

  const { data: movRaw } = await supabase
    .from('custom_inventory_movements')
    .select('id, delta, source_type, source_id, created_at')
    .eq('user_id', user.id)
    .eq('custom_inventory_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const movements = (movRaw ?? []) as Movement[];

  return (
    <div className="space-y-5">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        보유 재고
      </Link>

      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {row.name}{' '}
          <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">
            수기
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          현재 보유: <span className="font-mono tabular text-foreground">{row.quantity}</span>개
        </p>
      </header>

      {movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">변동 내역이 없습니다.</p>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {movements.map((m) => {
            const Icon =
              m.source_type === 'admin_delete'
                ? Trash2
                : m.source_type === 'admin_adjust'
                  ? Wrench
                  : m.delta > 0
                    ? ArrowUp
                    : ArrowDown;
            const cls = m.delta > 0 ? 'text-success' : 'text-destructive';
            return (
              <li key={m.id} className="p-4 flex items-center gap-3">
                <Icon className={`h-4 w-4 ${cls}`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{SOURCE_LABEL[m.source_type] ?? m.source_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('ko-KR')}
                    {m.source_id && (
                      <span className="ml-2 font-mono">{m.source_id.slice(0, 8)}</span>
                    )}
                  </p>
                </div>
                <span className={`font-mono tabular text-sm font-medium ${cls}`}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
