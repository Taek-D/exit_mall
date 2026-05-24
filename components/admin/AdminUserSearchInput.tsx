'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

type AdminUserSearchInputProps = {
  initialQuery: string;
};

export function AdminUserSearchInput({ initialQuery }: AdminUserSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextValue = value.trim();
    const currentValue = searchParams.get('q')?.trim() ?? '';

    if (currentValue === nextValue) return;

    if (nextValue) {
      params.set('q', nextValue);
    } else {
      params.delete('q');
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [pathname, router, searchParams, value]);

  return (
    <div className="relative max-w-sm">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="이름 또는 초성 검색"
        className="h-9 w-full rounded-md border bg-background pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        aria-label="사용자 이름 또는 초성 검색"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      {isPending ? <span className="sr-only">검색 중</span> : null}
    </div>
  );
}
