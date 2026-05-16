'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { createFaq, updateFaq, type Faq } from '@/lib/guide/faqs';
import { Button } from '@/components/ui/button';

type Props =
  | { mode: 'create' }
  | { mode: 'edit'; faq: Faq };

export function FaqEditor(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = props.mode === 'edit' ? props.faq : null;

  const [audience, setAudience] = useState<'user' | 'admin'>(initial?.audience ?? 'user');
  const [groups, setGroups] = useState<('group1' | 'group2')[]>(
    initial?.user_groups as ('group1' | 'group2')[] | null ?? ['group1'],
  );
  const [category, setCategory] = useState(initial?.category ?? 'getting-started');
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [topError, setTopError] = useState<string | null>(null);

  const categoryOptions =
    audience === 'user' ? USER_FAQ_CATEGORIES : ADMIN_FAQ_CATEGORIES;
  const labelMap =
    audience === 'user' ? USER_FAQ_CATEGORY_LABEL : ADMIN_FAQ_CATEGORY_LABEL;

  const toggleGroup = (g: 'group1' | 'group2') => {
    setGroups(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g],
    );
  };

  const submit = () => {
    setErrors({});
    setTopError(null);
    start(async () => {
      const input =
        audience === 'user'
          ? { audience: 'user' as const, user_groups: groups, category, question, answer, sort_order: sortOrder }
          : { audience: 'admin' as const, user_groups: null, category, question, answer, sort_order: sortOrder };
      const result =
        props.mode === 'create'
          ? await createFaq(input as any)
          : await updateFaq(props.faq.id, input as any);
      if (!result.ok) {
        setTopError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      router.push('/admin/guide/faq/manage');
      router.refresh();
    });
  };

  // 카테고리가 audience에 안 맞으면 첫 항목으로 리셋
  if (!(categoryOptions as readonly string[]).includes(category)) {
    setCategory(categoryOptions[0]);
  }

  return (
    <div className="space-y-4">
      {topError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{topError}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">대상</label>
        <select
          value={audience}
          onChange={e => setAudience(e.target.value as 'user' | 'admin')}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="user">사용자 (group1/group2)</option>
          <option value="admin">관리자</option>
        </select>
      </div>

      {audience === 'user' && (
        <div>
          <label className="block text-sm font-medium text-slate-700">노출 그룹</label>
          <div className="mt-1 flex gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groups.includes('group1')} onChange={() => toggleGroup('group1')} />
              group1
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groups.includes('group2')} onChange={() => toggleGroup('group2')} />
              group2
            </label>
          </div>
          {errors.user_groups && <p className="mt-1 text-xs text-red-600">{errors.user_groups[0]}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">카테고리</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          {categoryOptions.map(c => (
            <option key={c} value={c}>{(labelMap as Record<string, string>)[c]}</option>
          ))}
        </select>
        {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">질문 (최대 200자)</label>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        {errors.question && <p className="mt-1 text-xs text-red-600">{errors.question[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">답변 (markdown, 최대 5000자)</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          maxLength={5000}
          rows={10}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm"
        />
        {errors.answer && <p className="mt-1 text-xs text-red-600">{errors.answer[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">정렬 순서 (작은 값이 위)</label>
        <input
          type="number"
          value={sortOrder}
          onChange={e => setSortOrder(parseInt(e.target.value, 10) || 0)}
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {props.mode === 'create' ? '등록' : '저장'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          취소
        </Button>
      </div>
    </div>
  );
}
