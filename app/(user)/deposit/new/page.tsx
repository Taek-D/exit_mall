import { createClient } from '@/lib/supabase/server';
import { createDepositRequestAction } from '@/lib/actions/deposit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Settings = {
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
  notice: string;
};

export default async function NewDepositPage() {
  const supabase = createClient();
  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single<Settings>();

  const hasAccount = !!settings?.bank_name;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        href="/deposit"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        예치금 내역
      </Link>

      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">이체 요청</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이체 후 아래 폼을 제출하면 관리자 확인을 거쳐 예치금에 반영됩니다.
        </p>
      </header>

      <section className="rounded-lg border bg-card">
        <div className="p-5 border-b">
          <h2 className="font-heading font-semibold">입금 계좌</h2>
        </div>
        <div className="p-5">
          {hasAccount ? (
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  은행
                </dt>
                <dd className="text-sm font-medium">{settings.bank_name}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  계좌번호
                </dt>
                <dd className="text-sm font-mono tabular">{settings.bank_account_number}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  예금주
                </dt>
                <dd className="text-sm">{settings.bank_account_holder}</dd>
              </div>
              {settings.notice && (
                <div className="mt-4 rounded-md border bg-accent/5 p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-accent shrink-0" aria-hidden />
                  <p className="text-sm text-foreground">{settings.notice}</p>
                </div>
              )}
            </dl>
          ) : (
            <div
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <p>관리자가 계좌 정보를 아직 설정하지 않았습니다. 운영자에게 문의해주세요.</p>
            </div>
          )}
        </div>
      </section>

      <form
        action={createDepositRequestAction as unknown as (fd: FormData) => void}
        className="rounded-lg border bg-card space-y-5 p-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="amount">금액</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono"
              aria-hidden
            >
              ₩
            </span>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={1000}
              step={1000}
              required
              placeholder="10,000"
              className="pl-7 font-mono tabular"
            />
          </div>
          <p className="text-xs text-muted-foreground">최소 1,000원, 1,000원 단위로 입력</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="depositorName">입금자명</Label>
          <Input id="depositorName" name="depositorName" required placeholder="이체 시 기재한 이름" />
          <p className="text-xs text-muted-foreground">
            실제 이체 시 입금자명과 동일하게 입력해주세요.
          </p>
        </div>

        <Button type="submit" className="w-full h-11" disabled={!hasAccount}>
          이체 완료 — 확인 요청
        </Button>
      </form>
    </div>
  );
}
