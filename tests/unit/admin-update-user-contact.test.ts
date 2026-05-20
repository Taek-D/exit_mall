import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { requireAdmin } from '@/lib/actions/_guards';
import { updateUserContactAction } from '@/lib/actions/admin-users';

const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
  from.mockReturnValue({ update });
});

describe('updateUserContactAction', () => {
  it('updates only profile name and phone for admins', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      supabase: { from } as any,
      user: { id: 'admin-1' } as any,
      profile: { role: 'admin', status: 'active' },
    });

    const fd = new FormData();
    fd.set('name', '  Kim Exit  ');
    fd.set('phone', '010-1234-5678');

    const result = await updateUserContactAction('user-1', fd);

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({
      name: 'Kim Exit',
      phone: '010-1234-5678',
    });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('rejects invalid contact fields before updating', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      supabase: { from } as any,
      user: { id: 'admin-1' } as any,
      profile: { role: 'admin', status: 'active' },
    });

    const fd = new FormData();
    fd.set('name', '');
    fd.set('phone', '12345');

    const result = await updateUserContactAction('user-1', fd);

    expect(result).toHaveProperty('error');
    expect(from).not.toHaveBeenCalled();
  });
});
