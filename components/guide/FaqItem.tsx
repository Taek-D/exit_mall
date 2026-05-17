'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FaqAnswer } from './FaqAnswer';
import type { Faq } from '@/lib/guide/faqs';

export function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-base font-medium text-slate-900"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{faq.question}</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-3 text-sm text-slate-700">
          <FaqAnswer source={faq.answer} />
        </div>
      )}
    </div>
  );
}
