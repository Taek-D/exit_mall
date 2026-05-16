import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFaqById } from '@/lib/guide/faqs';
import { FaqEditor } from '@/components/guide/FaqEditor';

export const dynamic = 'force-dynamic';

export default async function EditFaqPage({ params }: { params: { id: string } }) {
  const faq = await getFaqById(params.id);
  if (!faq) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">FAQ 수정</h1>
        <p className="mt-1 text-sm text-slate-600">
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">← 목록으로</Link>
        </p>
      </header>
      <FaqEditor mode="edit" faq={faq} />
    </div>
  );
}
