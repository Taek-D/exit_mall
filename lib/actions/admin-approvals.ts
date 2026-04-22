'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function approveUserAction(userId: string) {
  const supabase = createClient();
  const { error } = await (supabase.from('profiles') as any)
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const supabase = createClient();
  const { error } = await (supabase.from('profiles') as any).update({ status: 'suspended' }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/approvals');
  return { ok: true };
}
