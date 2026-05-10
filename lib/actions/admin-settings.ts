'use server';
import { appSettingsSchema } from '@/lib/schemas';
import { requireAdmin } from '@/lib/actions/_guards';
import { formatZodError, mutationTable, revalidatePaths } from '@/lib/actions/_shared';

export async function saveAppSettingsAction(fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  const parsed = appSettingsSchema.safeParse({
    bankName: fd.get('bankName') ?? '',
    bankAccountNumber: fd.get('bankAccountNumber') ?? '',
    bankAccountHolder: fd.get('bankAccountHolder') ?? '',
    notice: fd.get('notice') ?? '',
  });
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const { error } = await mutationTable(guard.supabase, 'app_settings').update({
    bank_name: parsed.data.bankName,
    bank_account_number: parsed.data.bankAccountNumber,
    bank_account_holder: parsed.data.bankAccountHolder,
    notice: parsed.data.notice,
    updated_at: new Date().toISOString(),
    updated_by: guard.user.id,
  }).eq('id', 1);
  if (error) {
    console.error('[admin-settings] save', error);
    return { error: '설정을 저장하지 못했습니다.' };
  }
  revalidatePaths(['/admin/settings', '/deposit/new']);
  return { ok: true };
}
