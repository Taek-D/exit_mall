import { describe, it, expect } from 'vitest';
import { isSelfUserGroupChange, isUserGroup } from '@/lib/auth/user-groups';

describe('setUserGroupAction input validation', () => {
  it('isUserGroup은 group1/group2만 통과시킨다', () => {
    expect(isUserGroup('group1')).toBe(true);
    expect(isUserGroup('group2')).toBe(true);
    expect(isUserGroup('group3')).toBe(false);
    expect(isUserGroup(null)).toBe(false);
  });

  it('관리자 본인 그룹 변경 시도를 식별한다', () => {
    expect(isSelfUserGroupChange('admin-1', 'admin-1')).toBe(true);
    expect(isSelfUserGroupChange('admin-1', 'user-1')).toBe(false);
  });
});
