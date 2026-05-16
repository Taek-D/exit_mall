import type { ReactNode } from 'react';

export function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h2>
      <div className="prose prose-sm max-w-none text-slate-700">{children}</div>
    </section>
  );
}
