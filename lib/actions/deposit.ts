'use server';
import { createClient } from '@/lib/supabase/server';
import { depositRequestSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createDepositRequestAction(formData: FormData) {
  const parsed = depositRequestSchema.safeParse({
    amount: Number(formData.get('amount')),
    depositorName: String(formData.get('depositorName') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('deposit_requests').insert({
    user_id: user.id,
    amount: parsed.data.amount,
    depositor_name: parsed.data.depositorName,
  } as never);
  if (error) return { error: error.message };

  revalidatePath('/deposit');
  redirect('/deposit');
}
