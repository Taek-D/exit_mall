import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewSupportRequestForm } from './NewSupportRequestForm';

export const dynamic = 'force-dynamic';

export default function NewSupportRequestPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header className="pb-4 border-b">
        <Link
          href="/support-requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 교환/반품 및 CS 문의
        </Link>
        <h1 className="font-heading font-semibold text-2xl tracking-tight mt-2">
          문의 등록
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          문의 내용을 남기면 관리자 답변을 비공개로 확인할 수 있습니다.
        </p>
      </header>
      <NewSupportRequestForm />
    </div>
  );
}
