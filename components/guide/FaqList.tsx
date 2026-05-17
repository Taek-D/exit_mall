'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FaqItem } from './FaqItem';
import type { Faq } from '@/lib/guide/faqs';

type CategoryDef = { value: string; label: string };

export function FaqList({
  faqs,
  categories,
}: {
  faqs: Faq[];
  categories: CategoryDef[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';

  // 검색 input은 URL의 q를 진실의 원천으로 두되, 매 키스트로크마다 router.replace를
  // useTransition으로 호출하면 pending 동안 controlled value가 깜빡일 수 있다.
  // 그래서 local state로 즉시 표시값을 들고, URL의 q가 외부 변화(뒤로/앞으로
  // 이동, 직접 URL 입력 등)로 바뀌면 effect로 동기화한다.
  const [text, setText] = useState(q);
  useEffect(() => {
    setText(q);
  }, [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`?${next.toString()}`));
  };

  const grouped = new Map<string, Faq[]>();
  for (const f of faqs) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="질문/답변 검색"
          value={text}
          onChange={e => {
            setText(e.target.value);
            setParam('q', e.target.value);
          }}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:max-w-sm"
        />
        <select
          value={category}
          onChange={e => setParam('category', e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="">전체 카테고리</option>
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      {pending && <p className="text-xs text-slate-400">검색 중…</p>}
      {faqs.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          조건에 맞는 FAQ가 없습니다.
        </p>
      ) : (
        Array.from(grouped.entries()).map(([cat, items]) => (
          <section key={cat}>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">
              {categories.find(c => c.value === cat)?.label ?? cat}
            </h3>
            <div className="divide-y divide-slate-100">
              {items.map(f => <FaqItem key={f.id} faq={f} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
