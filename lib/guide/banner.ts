'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { mutationTable } from '@/lib/actions/_shared';
import type { ActionResult } from './faqs';

export async function dismissGuideBanner(): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { error } = await mutationTable(supabase, 'profiles')
    .update({ guide_banner_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
