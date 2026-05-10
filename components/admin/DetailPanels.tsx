import type { ReactNode } from 'react';
import { User } from 'lucide-react';

export function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono tabular ${
          highlight ? 'text-xl font-semibold' : 'text-base'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function HistoryTable({
  headers,
  rows,
  rightAligned = [],
}: {
  headers: string[];
  rows: ReactNode[][];
  rightAligned?: number[];
}) {
  if (rows.length === 0) {
    return <div className="p-10 text-center text-sm text-muted-foreground">기록이 없습니다.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            {headers.map((header, index) => (
              <th
                key={index}
                className={`font-medium px-3 h-10 ${
                  rightAligned.includes(index) ? 'text-right' : 'text-left'
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t h-11 hover:bg-surface-muted/50 transition-colors">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-3 ${rightAligned.includes(cellIndex) ? 'text-right' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerSummaryCard({
  name,
  email,
  phone,
  balance,
  insufficient,
}: {
  name: string;
  email: string;
  phone: string;
  balance: string;
  insufficient?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-medium">고객</h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">이름</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">이메일</dt>
          <dd className="font-mono">{email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">연락처</dt>
          <dd className="font-mono">{phone}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">예치금</dt>
          <dd className={`font-mono ${insufficient ? 'text-destructive font-medium' : ''}`}>
            {balance}
          </dd>
        </div>
      </dl>
    </div>
  );
}
