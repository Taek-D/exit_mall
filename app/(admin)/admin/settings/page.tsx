import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

type Settings = { bank_name: string; bank_account_number: string; bank_account_holder: string; notice: string };

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: s } = await supabase.from('app_settings').select('*').eq('id', 1).single<Settings>();
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">앱 설정</h1>
      <SettingsForm defaults={{
        bankName: s?.bank_name ?? '', bankAccountNumber: s?.bank_account_number ?? '',
        bankAccountHolder: s?.bank_account_holder ?? '', notice: s?.notice ?? '',
      }} />
    </div>
  );
}
