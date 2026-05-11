import { describe, expect, it, vi } from 'vitest';
import { submitSignupApplication } from '@/lib/auth/signup-application';
import type { SignupInput } from '@/lib/schemas';

const input: SignupInput = {
  email: 'USER@Example.com',
  password: 'password123',
  name: '홍길동',
  phone: '010-1234-5678',
};

function authClient(error: { message: string } | null = null) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ error }),
    },
  } as any;
}

function serviceClient({
  profile,
  updated = { id: 'user-1', status: 'pending' },
  updateUserError = null,
}: {
  profile: { id: string; status: string } | null;
  updated?: { id: string; status: string } | null;
  updateUserError?: { message: string } | null;
}) {
  const lookupMaybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const updateMaybeSingle = vi.fn().mockResolvedValue({ data: updated, error: null });

  const lookupRoot = {
    select: vi.fn(() => ({
      ilike: vi.fn(() => ({ maybeSingle: lookupMaybeSingle })),
    })),
  };

  const updateChain = {
    eq: vi.fn(),
    select: vi.fn(),
  };
  updateChain.eq.mockReturnValue(updateChain);
  updateChain.select.mockReturnValue({ maybeSingle: updateMaybeSingle });
  const updateRoot = {
    update: vi.fn(() => updateChain),
  };

  return {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: updateUserError }),
      },
    },
    from: vi.fn().mockReturnValueOnce(lookupRoot).mockReturnValueOnce(updateRoot),
    lookupRoot,
    updateRoot,
    updateChain,
  } as any;
}

describe('submitSignupApplication', () => {
  it('submits a new signup with a normalized email', async () => {
    const supabase = authClient();

    await expect(submitSignupApplication(input, supabase)).resolves.toEqual({
      ok: true,
      reapplied: false,
    });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: input.password,
      options: { data: { name: input.name, phone: input.phone } },
    });
  });

  it('keeps non-rejected duplicate emails blocked', async () => {
    const supabase = authClient({ message: 'User already registered' });
    const service = serviceClient({ profile: { id: 'user-1', status: 'active' } });

    await expect(submitSignupApplication(input, supabase, service)).resolves.toEqual({
      ok: false,
      error: '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해주세요.',
    });
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('reopens a rejected profile as pending with the new signup details', async () => {
    const supabase = authClient({ message: 'User already registered' });
    const service = serviceClient({ profile: { id: 'user-1', status: 'rejected' } });

    await expect(submitSignupApplication(input, supabase, service)).resolves.toEqual({
      ok: true,
      reapplied: true,
    });
    expect(service.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
      password: input.password,
      user_metadata: { name: input.name, phone: input.phone },
      email_confirm: true,
    });
    expect(service.updateRoot.update).toHaveBeenCalledWith({
      email: 'user@example.com',
      name: input.name,
      phone: input.phone,
      status: 'pending',
      approved_at: null,
    });
  });
});
