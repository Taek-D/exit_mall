export function formatKRW(amount: number | bigint): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}₩${abs.toLocaleString('ko-KR')}`;
}

export function parseKRWInput(raw: string): number | null {
  const cleaned = raw.replace(/[₩,\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}
