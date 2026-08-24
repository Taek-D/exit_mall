export function formatDateTimeKR(value: string | number | Date): string {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "8. 17." 대신 "8/17" — 목록·배너에서 날짜를 짧게 참조할 때 쓴다. */
export function formatShortDateKR(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(value));
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${month}/${day}`;
}

export function formatShortDateTimeKR(value: string | number | Date): string {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });
}
