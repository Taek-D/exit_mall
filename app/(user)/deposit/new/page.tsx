import { createClient } from '@/lib/supabase/server';
import { createDepositRequestAction } from '@/lib/actions/deposit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

type Settings = { bank_name: string; bank_account_number: string; bank_account_holder: string; notice: string };

export default async function NewDepositPage() {
  const supabase = createClient();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single<Settings>();

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">예치금 이체 요청</h1>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">입금 계좌</h2>
          {settings?.bank_name ? (
            <>
              <p>{settings.bank_name} {settings.bank_account_number}</p>
              <p className="text-sm text-muted-foreground">예금주: {settings.bank_account_holder}</p>
              {settings.notice && <Alert className="mt-2"><AlertDescription>{settings.notice}</AlertDescription></Alert>}
            </>
          ) : (
            <Alert variant="destructive"><AlertDescription>관리자가 계좌 정보를 아직 설정하지 않았습니다.</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <form action={createDepositRequestAction as unknown as (fd: FormData) => void} className="space-y-4">
        <div><Label htmlFor="amount">금액 (최소 1,000원)</Label><Input id="amount" name="amount" type="number" min={1000} step={1000} required /></div>
        <div><Label htmlFor="depositorName">입금자명</Label><Input id="depositorName" name="depositorName" required /></div>
        <Button type="submit" className="w-full">이체 완료 (확인 요청)</Button>
        <p className="text-xs text-muted-foreground">이체 후 본 버튼을 누르면 관리자에게 확인 요청이 전송됩니다. 관리자 확인 후 예치금이 반영됩니다.</p>
      </form>
    </div>
  );
}
