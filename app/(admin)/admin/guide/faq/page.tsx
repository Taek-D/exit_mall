import Link from 'next/link';
import { getAdminFaqs } from '@/lib/guide/faqs';
import {
  ADMIN_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { FaqList } from '@/components/guide/FaqList';

export const dynamic = 'force-dynamic';

export default async function AdminFaqPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const faqs = await getAdminFaqs({
    audience: 'admin',
    category: searchParams.category,
    query: searchParams.q,
  });

  const categories = ADMIN_FAQ_CATEGORIES.map(v => ({
    value: v,
    label: ADMIN_FAQ_CATEGORY_LABEL[v],
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">관리자 FAQ</h1>
        <p className="mt-2 text-sm text-slate-600">
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">FAQ 관리 →</Link>
        </p>
      </header>
      <FaqList faqs={faqs} categories={categories} />
    </div>
  );
}
