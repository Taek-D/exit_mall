import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Group1Guide } from '@/components/guide/Group1Guide';
import { Group2Guide } from '@/components/guide/Group2Guide';

export const dynamic = 'force-dynamic';

export default async function GuidePage({
  searchParams,
}: {
  searchParams: { as?: string };
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

  const isAdmin = profile.role === 'admin';
  const adminPreview = isAdmin && searchParams.as === 'group2';
  const effectiveGroup: 'group1' | 'group2' =
    adminPreview ? 'group2' : (profile.user_group === 'group2' ? 'group2' : 'group1');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">가이드</h1>
        <p className="mt-2 text-sm text-slate-600">
          엑시트몰의 주요 흐름과 사용법을 정리한 안내입니다.{' '}
          <Link href="/guide/faq" className="text-sky-700 hover:underline">자주 묻는 질문 →</Link>
        </p>
        {isAdmin && (
          <div className="mt-3 text-xs text-slate-500">
            관리자 보기: {effectiveGroup === 'group2' ? (
              <Link href="/guide" className="text-sky-700 hover:underline">group1 가이드로 돌아가기</Link>
            ) : (
              <Link href="/guide?as=group2" className="text-sky-700 hover:underline">group2 가이드 미리보기</Link>
            )}
          </div>
        )}
      </header>
      {effectiveGroup === 'group2' ? <Group2Guide /> : <Group1Guide />}
    </div>
  );
}
