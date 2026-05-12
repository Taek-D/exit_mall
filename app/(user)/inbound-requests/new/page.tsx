import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewRequestForm } from './NewRequestForm';

export const dynamic = 'force-dynamic';

export default function NewInboundRequestPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header className="pb-4 border-b">
        <Link
          href="/inbound-requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 입고리스트
        </Link>
        <h1 className="font-heading font-semibold text-2xl tracking-tight mt-2">
          새 입고요청
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          엑셀 양식과 (선택) 이미지를 첨부해주세요. 등록 후 비공개 게시글로 보관됩니다.
        </p>
      </header>
      <NewRequestForm />
    </div>
  );
}
