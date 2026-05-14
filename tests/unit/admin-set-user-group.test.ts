import { describe, it, expect } from 'vitest';
import { isUserGroup } from '@/lib/auth/user-groups';

describe('setUserGroupAction input validation', () => {
  it('isUserGroup은 group1/group2만 통과시킨다', () => {
    expect(isUserGroup('group1')).toBe(true);
    expect(isUserGroup('group2')).toBe(true);
    expect(isUserGroup('group3')).toBe(false);
    expect(isUserGroup(null)).toBe(false);
  });
});
