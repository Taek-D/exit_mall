import { describe, it, expect } from 'vitest';
import { isUserGroup } from '@/lib/auth/user-groups';

// approveUserAction에서 사용하는 입력 검증 로직만 격리해 검증한다.
// 액션 본체는 Supabase 통합 의존이라 별도 통합 테스트 환경 없이는 못 돌린다.
describe('approveUserAction input validation', () => {
  it('isUserGroup이 group1/group2만 통과시킨다', () => {
    expect(isUserGroup('group1')).toBe(true);
    expect(isUserGroup('group2')).toBe(true);
  });

  it('잘못된 값은 거부한다', () => {
    expect(isUserGroup(undefined)).toBe(false);
    expect(isUserGroup(null)).toBe(false);
    expect(isUserGroup('')).toBe(false);
    expect(isUserGroup('group3')).toBe(false);
    expect(isUserGroup('admin')).toBe(false);
    expect(isUserGroup(1)).toBe(false);
  });
});
