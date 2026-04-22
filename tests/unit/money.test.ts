import { describe, it, expect } from 'vitest';
import { formatKRW, parseKRWInput } from '@/lib/money';

describe('formatKRW', () => {
  it('formats zero as ₩0', () => expect(formatKRW(0)).toBe('₩0'));
  it('adds comma separators', () => expect(formatKRW(1234567)).toBe('₩1,234,567'));
  it('handles negative values', () => expect(formatKRW(-500)).toBe('-₩500'));
  it('handles bigint', () => expect(formatKRW(50000n)).toBe('₩50,000'));
});

describe('parseKRWInput', () => {
  it('parses digits only', () => expect(parseKRWInput('50000')).toBe(50000));
  it('strips commas and symbols', () => expect(parseKRWInput('₩1,234,567')).toBe(1234567));
  it('returns null for invalid input', () => expect(parseKRWInput('abc')).toBe(null));
  it('returns null for empty', () => expect(parseKRWInput('')).toBe(null));
  it('handles negative', () => expect(parseKRWInput('-1000')).toBe(-1000));
});
