import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-4 bg-surface">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mx-auto">
          <FileQuestion className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-heading font-semibold text-lg">페이지를 찾을 수 없어요</h1>
          <p className="text-sm text-muted-foreground">
            주소가 변경되었거나 삭제된 페이지일 수 있어요.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/shop">
            <Home className="h-4 w-4" aria-hidden />
            홈으로 돌아가기
          </Link>
        </Button>
      </div>
    </div>
  );
}
