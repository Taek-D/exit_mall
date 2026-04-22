'use server';
import { createClient } from '@/lib/supabase/server';
import { appSettingsSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export async function saveAppSettingsAction(fd: FormData) {
  const parsed = appSettingsSchema.safeParse({
    bankName: fd.get('bankName') ?? '',
    bankAccountNumber: fd.get('bankAccountNumber') ?? '',
    bankAccountHolder: fd.get('bankAccountHolder') ?? '',
    notice: fd.get('notice') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.errors.map(e => e.message).join(' · ') };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await (supabase.from('app_settings') as any).update({
    bank_name: parsed.data.bankName,
    bank_account_number: parsed.data.bankAccountNumber,
    bank_account_holder: parsed.data.bankAccountHolder,
    notice: parsed.data.notice,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  }).eq('id', 1);
  if (error) return { error: error.message };
  revalidatePath('/admin/settings'); revalidatePath('/deposit/new');
  return { ok: true };
}
