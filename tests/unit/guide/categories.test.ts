import { describe, it, expect } from 'vitest';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
  isUserFaqCategory,
  isAdminFaqCategory,
} from '@/lib/guide/categories';

describe('FAQ categories', () => {
  it('user and admin categories are disjoint at the value level only where needed', () => {
    expect(USER_FAQ_CATEGORIES).toContain('purchase');
    expect(ADMIN_FAQ_CATEGORIES).toContain('approvals');
  });

  it('all user categories have label', () => {
    for (const c of USER_FAQ_CATEGORIES) {
      expect(USER_FAQ_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it('all admin categories have label', () => {
    for (const c of ADMIN_FAQ_CATEGORIES) {
      expect(ADMIN_FAQ_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it('isUserFaqCategory accepts only user values', () => {
    expect(isUserFaqCategory('purchase')).toBe(true);
    expect(isUserFaqCategory('approvals')).toBe(false);
    expect(isUserFaqCategory('bogus')).toBe(false);
  });

  it('isAdminFaqCategory accepts only admin values', () => {
    expect(isAdminFaqCategory('approvals')).toBe(true);
    expect(isAdminFaqCategory('purchase')).toBe(false);
  });
});
