'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { dismissGuideBanner } from '@/lib/guide/banner';
import { Button } from '@/components/ui/button';

export function GuideBanner({ guideHref }: { guideHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onDismiss = () => {
    start(async () => {
      await dismissGuideBanner();
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-2 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-700">
        처음이시면 가이드를 먼저 읽어보세요. 엑시트몰의 주요 흐름을 정리해 두었습니다.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="default" size="sm">
          <Link href={guideHref}>가이드 열기</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={pending}>
          닫기
        </Button>
      </div>
    </div>
  );
}
