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

export function formatShortDateTimeKR(value: string | number | Date): string {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });
}
