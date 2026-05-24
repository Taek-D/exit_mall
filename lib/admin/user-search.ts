const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_INITIAL_UNIT = 588;

const HANGUL_INITIALS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

export function getHangulInitials(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_BASE_CODE || code > HANGUL_LAST_CODE) return char;

      const initialIndex = Math.floor((code - HANGUL_BASE_CODE) / HANGUL_INITIAL_UNIT);
      return HANGUL_INITIALS[initialIndex] ?? char;
    })
    .join('');
}

export function matchesAdminUserNameQuery(name: string, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const normalizedName = normalizeSearchValue(name);
  const normalizedInitials = normalizeSearchValue(getHangulInitials(name));

  return normalizedName.includes(normalizedQuery) || normalizedInitials.includes(normalizedQuery);
}
