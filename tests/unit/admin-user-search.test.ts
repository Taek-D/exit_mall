import { describe, expect, it } from 'vitest';
import { getHangulInitials, matchesAdminUserNameQuery } from '@/lib/admin/user-search';

describe('admin user search helpers', () => {
  it('generates Korean initial consonants for complete Hangul syllables', () => {
    expect(getHangulInitials('김민정')).toBe('ㄱㅁㅈ');
  });

  it('matches a full Korean initial query', () => {
    expect(matchesAdminUserNameQuery('김민정', 'ㄱㅁㅈ')).toBe(true);
  });

  it('matches a partial Korean initial query', () => {
    expect(matchesAdminUserNameQuery('김민정', 'ㄱㅁ')).toBe(true);
  });

  it('matches a partial Korean name query', () => {
    expect(matchesAdminUserNameQuery('김민정', '민정')).toBe(true);
  });

  it('treats an empty query as a match', () => {
    expect(matchesAdminUserNameQuery('김민정', '   ')).toBe(true);
  });

  it('matches non-Korean letters case-insensitively', () => {
    expect(matchesAdminUserNameQuery('TestUser', 'test')).toBe(true);
  });
});
