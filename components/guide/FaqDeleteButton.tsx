'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFaq } from '@/lib/guide/faqs';

export function FaqDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('이 FAQ를 삭제할까요? 되돌릴 수 없습니다.')) return;
        start(async () => {
          await deleteFaq(id);
          router.refresh();
        });
      }}
      className="text-red-600 hover:underline disabled:opacity-50"
    >
      삭제
    </button>
  );
}
