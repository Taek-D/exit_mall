import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createFaq, updateFaq, deleteFaq } from '@/lib/guide/faqs';
import { requireAdmin } from '@/lib/actions/_guards';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FAQ admin actions', () => {
  it('createFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await createFaq({
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
      question: 'Q',
      answer: 'A',
      sort_order: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('관리자');
  });

  it('updateFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await updateFaq('id', {
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
      question: 'Q',
      answer: 'A',
      sort_order: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('deleteFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await deleteFaq('id');
    expect(r.ok).toBe(false);
  });

  it('createFaq returns fieldErrors on invalid input', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      supabase: {} as any,
      user: { id: 'u' } as any,
      profile: { role: 'admin', status: 'active' },
    });
    const r = await createFaq({
      audience: 'user',
      user_groups: [],
      category: 'purchase',
      question: '',
      answer: '',
      sort_order: 0,
    } as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toBeTruthy();
  });
});
