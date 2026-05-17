import { describe, it, expect } from 'vitest';
import { FaqInputSchema } from '@/lib/guide/schemas';

const base = {
  question: 'Q',
  answer: 'A',
  sort_order: 0,
};

describe('FaqInputSchema', () => {
  it('accepts user audience with group1 only', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1'],
      category: 'purchase',
    });
    expect(r.success).toBe(true);
  });

  it('accepts user audience with both groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1', 'group2'],
      category: 'inbound',
    });
    expect(r.success).toBe(true);
  });

  it('rejects user audience without user_groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: [],
      category: 'purchase',
    });
    expect(r.success).toBe(false);
  });

  it('rejects user audience with admin category', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1'],
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('accepts admin audience with admin category and no user_groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(true);
  });

  it('rejects admin audience with user_groups present', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'admin',
      user_groups: ['group1'],
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty question', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      question: '',
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects question over 200 chars', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      question: 'x'.repeat(201),
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects answer over 5000 chars', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      answer: 'y'.repeat(5001),
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });
});
