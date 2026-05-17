import Link from 'next/link';
import { getAdminFaqs } from '@/lib/guide/faqs';
import {
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { Button } from '@/components/ui/button';
import { FaqDeleteButton } from '@/components/guide/FaqDeleteButton';

export const dynamic = 'force-dynamic';

export default async function FaqManagePage({
  searchParams,
}: {
  searchParams: { audience?: string | string[]; q?: string | string[] };
}) {
  const faqs = await getAdminFaqs({
    audience: searchParams.audience,
    query: searchParams.q,
  });

  const labelFor = (audience: string, category: string) =>
    audience === 'user'
      ? (USER_FAQ_CATEGORY_LABEL as Record<string, string>)[category] ?? category
      : (ADMIN_FAQ_CATEGORY_LABEL as Record<string, string>)[category] ?? category;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">FAQ 관리</h1>
        <Button asChild>
          <Link href="/admin/guide/faq/manage/new">새 FAQ 등록</Link>
        </Button>
      </header>

      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/guide/faq/manage" className={!searchParams.audience ? 'font-semibold text-sky-700' : 'text-slate-600'}>전체</Link>
        <Link href="/admin/guide/faq/manage?audience=user" className={searchParams.audience === 'user' ? 'font-semibold text-sky-700' : 'text-slate-600'}>사용자</Link>
        <Link href="/admin/guide/faq/manage?audience=admin" className={searchParams.audience === 'admin' ? 'font-semibold text-sky-700' : 'text-slate-600'}>관리자</Link>
      </div>

      {faqs.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          등록된 FAQ가 없습니다.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">대상</th>
              <th className="px-2 py-2">카테고리</th>
              <th className="px-2 py-2">노출 그룹</th>
              <th className="px-2 py-2">질문</th>
              <th className="px-2 py-2">순서</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {faqs.map(f => (
              <tr key={f.id}>
                <td className="px-2 py-2">{f.audience === 'user' ? '사용자' : '관리자'}</td>
                <td className="px-2 py-2">{labelFor(f.audience, f.category)}</td>
                <td className="px-2 py-2">{f.user_groups?.join(', ') ?? '-'}</td>
                <td className="px-2 py-2 max-w-md truncate">{f.question}</td>
                <td className="px-2 py-2 tabular-nums">{f.sort_order}</td>
                <td className="px-2 py-2 space-x-2 whitespace-nowrap">
                  <Link href={`/admin/guide/faq/manage/${f.id}/edit`} className="text-sky-700 hover:underline">수정</Link>
                  <FaqDeleteButton id={f.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
