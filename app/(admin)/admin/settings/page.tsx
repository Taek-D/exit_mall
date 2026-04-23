import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

type Settings = {
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
  notice: string;
};

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: s } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single<Settings>();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="pb-4 border-b">
        <p className="text-sm text-muted-foreground">
          이체 요청 페이지에 표시되는 계좌 정보와 안내 문구를 관리합니다.
        </p>
      </header>
      <SettingsForm
        defaults={{
          bankName: s?.bank_name ?? '',
          bankAccountNumber: s?.bank_account_number ?? '',
          bankAccountHolder: s?.bank_account_holder ?? '',
          notice: s?.notice ?? '',
        }}
      />
    </div>
  );
}
