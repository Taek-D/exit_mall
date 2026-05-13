import { describe, it, expect } from 'vitest';
import { safeFilename } from '@/lib/inbound/storage';

describe('safeFilename', () => {
  it('passes through a plain ASCII filename', () => {
    expect(safeFilename('report.xlsx')).toBe('report.xlsx');
  });

  it('strips leading dots', () => {
    expect(safeFilename('.hidden.xlsx')).toBe('hidden.xlsx');
    expect(safeFilename('...x.xlsx')).toBe('x.xlsx');
  });

  it('collapses runs of dots into a single dot', () => {
    expect(safeFilename('a..b.xlsx')).toBe('a.b.xlsx');
    expect(safeFilename('a...b....c.xlsx')).toBe('a.b.c.xlsx');
  });

  it('preserves Korean characters', () => {
    expect(safeFilename('입고리스트양식.xlsx')).toBe('입고리스트양식.xlsx');
  });

  it('replaces unsafe characters with underscore', () => {
    expect(safeFilename('hello world.xlsx')).toBe('hello_world.xlsx');
    expect(safeFilename('a/b/c.xlsx')).toBe('a_b_c.xlsx');
    expect(safeFilename('a\\b.xlsx')).toBe('a_b.xlsx');
  });

  it('preserves underscore and hyphen', () => {
    expect(safeFilename('my_file-2026.xlsx')).toBe('my_file-2026.xlsx');
  });

  it('neutralizes traversal-like inputs', () => {
    // Output must contain no path separators and no `..` sequence.
    const out = safeFilename('../../etc/passwd');
    expect(out).not.toContain('/');
    expect(out).not.toContain('..');
    expect(safeFilename('..a.xlsx')).toBe('a.xlsx');
  });

  it('handles names that are entirely dots', () => {
    expect(safeFilename('....')).toBe('');
  });

  it('handles empty input', () => {
    expect(safeFilename('')).toBe('');
  });
});
