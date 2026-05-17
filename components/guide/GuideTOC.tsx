'use client';

import Link from 'next/link';

type TocItem = { id: string; label: string };

export function GuideTOC({ items }: { items: TocItem[] }) {
  return (
    <nav className="sticky top-20 hidden text-sm lg:block">
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.id}>
            <Link href={`#${item.id}`} className="text-slate-600 hover:text-sky-700">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
