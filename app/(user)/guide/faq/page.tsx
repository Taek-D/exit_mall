import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserFaqs } from '@/lib/guide/faqs';
import { USER_FAQ_CATEGORIES, USER_FAQ_CATEGORY_LABEL } from '@/lib/guide/categories';
import { FaqList } from '@/components/guide/FaqList';
import type { UserGroup } from '@/lib/auth/user-groups';

export const dynamic = 'force-dynamic';

export default async function FaqPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_group')
    .eq('id', user.id)
    .single<{ role: string; user_group: string | null }>();
  if (!profile) redirect('/login');

  const userGroup: UserGroup = profile.user_group === 'group2' ? 'group2' : 'group1';
  const faqs = await getUserFaqs({
    userGroup,
    category: searchParams.category,
    query: searchParams.q,
  });

  const categories = USER_FAQ_CATEGORIES.map(v => ({
    value: v,
    label: USER_FAQ_CATEGORY_LABEL[v],
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">자주 묻는 질문</h1>
      </header>
      <FaqList faqs={faqs} categories={categories} />
    </div>
  );
}
