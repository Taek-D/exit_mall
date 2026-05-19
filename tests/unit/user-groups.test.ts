import { describe, it, expect } from 'vitest';
import {
  isPathAllowedForGroup2,
  GROUP2_HOME,
  USER_GROUP_LABEL,
} from '@/lib/auth/user-groups';

describe('user-groups SSOT', () => {
  describe('USER_GROUP_LABEL', () => {
    it('group1 라벨에 "1그룹"이 포함된다', () => {
      expect(USER_GROUP_LABEL.group1).toContain('1그룹');
    });
    it('group2 라벨에 "2그룹"이 포함된다', () => {
      expect(USER_GROUP_LABEL.group2).toContain('2그룹');
    });
  });

  describe('GROUP2_HOME', () => {
    it('사입재고 배송대행 경로를 가리킨다', () => {
      expect(GROUP2_HOME).toBe('/shipping-uploads/purchased');
    });
  });

  describe('isPathAllowedForGroup2', () => {
    it.each([
      ['/shipping-uploads/purchased'],
      ['/shipping-uploads/purchased/abc-123'],
      ['/inbound-requests'],
      ['/inbound-requests/new'],
      ['/inbound-requests/abc-123'],
      ['/inbound-template.xlsx'],
      ['/shipping-template.xlsx'],
      ['/account'],
      ['/account/password'],
    ])('허용된 경로: %s', (p) => {
      expect(isPathAllowedForGroup2(p)).toBe(true);
    });

    it.each([
      ['/shop'],
      ['/cart'],
      ['/orders'],
      ['/orders/abc'],
      ['/inventory'],
      ['/inventory/product/abc'],
      ['/shipping-uploads/exitmall'],
      ['/shipping-uploads/exitmall/abc'],
      ['/deposit'],
      ['/admin'],
      ['/admin/users'],
      ['/'],
    ])('차단된 경로: %s', (p) => {
      expect(isPathAllowedForGroup2(p)).toBe(false);
    });

    it('prefix가 부분 일치인 경로는 차단된다', () => {
      expect(isPathAllowedForGroup2('/account-fake')).toBe(false);
      expect(isPathAllowedForGroup2('/inbound-requests-other')).toBe(false);
      expect(isPathAllowedForGroup2('/shipping-template.xlsx.bak')).toBe(false);
    });
  });
});
