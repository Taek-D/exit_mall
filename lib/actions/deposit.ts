'use server';
import { depositRequestSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { formatZodError } from '@/lib/actions/_shared';
import { requireUserGroup1 } from '@/lib/actions/_guards';
import { redirect } from 'next/navigation';

export async function createDepositRequestAction(formData: FormData) {
  const parsed = depositRequestSchema.safeParse({
    amount: Number(formData.get('amount')),
    depositorName: String(formData.get('depositorName') ?? ''),
  });
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const guard = await requireUserGroup1();
  if (!guard.ok) return { error: guard.error };
  const supabase = guard.supabase;
  const user = guard.user;

  const { error } = await supabase.from('deposit_requests').insert({
    user_id: user.id,
    amount: parsed.data.amount,
    depositor_name: parsed.data.depositorName,
  } as never);
  if (error) {
    console.error('[deposit] create', error);
    return { error: '입금 요청을 저장하지 못했습니다.' };
  }

  revalidatePath('/deposit');
  redirect('/deposit');
}
