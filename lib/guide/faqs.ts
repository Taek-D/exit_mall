'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/actions/_guards';
import { mutationTable } from '@/lib/actions/_shared';
import type { UserGroup } from '@/lib/auth/user-groups';
import { FaqInputSchema, type FaqInput } from './schemas';
import { isUserFaqCategory } from './categories';

export type Faq = {
  id: string;
  audience: 'user' | 'admin';
  user_groups: UserGroup[] | null;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function getUserFaqs(params: {
  userGroup: UserGroup;
  category?: string;
  query?: string;
}): Promise<Faq[]> {
  const supabase = createClient();
  let q = supabase
    .from('faqs')
    .select('*')
    .eq('audience', 'user')
    .contains('user_groups', [params.userGroup])
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (params.category && isUserFaqCategory(params.category)) {
    q = q.eq('category', params.category);
  }
  if (params.query && params.query.trim()) {
    const pattern = `%${params.query.replace(/[%_]/g, m => '\\' + m)}%`;
    q = q.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Faq[];
}

export async function getAdminFaqs(params: {
  audience?: 'user' | 'admin';
  category?: string;
  query?: string;
}): Promise<Faq[]> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error(guard.error);

  let q = guard.supabase
    .from('faqs')
    .select('*')
    .order('audience', { ascending: true })
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (params.audience) q = q.eq('audience', params.audience);
  if (params.category) q = q.eq('category', params.category);
  if (params.query && params.query.trim()) {
    const pattern = `%${params.query.replace(/[%_]/g, m => '\\' + m)}%`;
    q = q.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Faq[];
}

export async function getFaqById(id: string): Promise<Faq | null> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error(guard.error);
  const { data, error } = await guard.supabase.from('faqs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Faq | null;
}

function flattenZodErrors(err: z.ZodError): Record<string, string[]> {
  const flat: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (flat[key] ??= []).push(issue.message);
  }
  return flat;
}

export async function createFaq(input: FaqInput): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = FaqInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 확인해주세요.', fieldErrors: flattenZodErrors(parsed.error) };
  }

  const { data, error } = await mutationTable(guard.supabase, 'faqs')
    .insert({
      ...parsed.data,
      created_by: guard.user.id,
      updated_by: guard.user.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true, data: { id: data.id } };
}

export async function updateFaq(id: string, input: FaqInput): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = FaqInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 확인해주세요.', fieldErrors: flattenZodErrors(parsed.error) };
  }

  const { error } = await mutationTable(guard.supabase, 'faqs')
    .update({
      ...parsed.data,
      updated_by: guard.user.id,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await mutationTable(guard.supabase, 'faqs').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true };
}
