import Link from 'next/link';
import { AdminGuide } from '@/components/guide/AdminGuide';

export const dynamic = 'force-dynamic';

export default function AdminGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">관리자 가이드</h1>
        <p className="mt-2 text-sm text-slate-600">
          엑시트몰 운영 업무 안내입니다.{' '}
          <Link href="/admin/guide/faq" className="text-sky-700 hover:underline">자주 묻는 질문 →</Link>
          {' '}|{' '}
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">FAQ 관리 →</Link>
        </p>
      </header>
      <AdminGuide />
    </div>
  );
}
