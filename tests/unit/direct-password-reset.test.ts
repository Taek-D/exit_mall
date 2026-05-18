import { describe, expect, it, vi } from 'vitest';
import {
  DIRECT_PASSWORD_RESET_GENERIC_ERROR,
  DIRECT_PASSWORD_RESET_RATE_LIMIT_ERROR,
  completeDirectPasswordReset,
  startDirectPasswordReset,
} from '@/lib/auth/direct-password-reset';

const baseInput = {
  name: '홍길동',
  phone: '010-1234-5678',
  email: 'USER@example.com',
};

function createService({
  profile = { id: 'user-1', role: 'user', status: 'active', email: 'user@example.com', name: '홍길동', phone: '01012345678' },
  failedAttempts = 0,
  failedAttemptsByColumn,
  claimed = { id: 'challenge-1', user_id: 'user-1' },
  authError = null,
}: {
  profile?: any;
  failedAttempts?: number;
  failedAttemptsByColumn?: Partial<Record<'lookup_hash' | 'ip_hash', number>>;
  // 원자적 claim UPDATE의 결과. null이면 만료/이미 소진/존재하지 않는 토큰 케이스.
  claimed?: { id: string; user_id: string } | null;
  authError?: { message: string } | null;
} = {}) {
  const profileMaybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const attemptSelect = vi.fn((column?: 'lookup_hash' | 'ip_hash') =>
    Promise.resolve({
      count: failedAttemptsByColumn?.[column ?? 'lookup_hash'] ?? failedAttempts,
      error: null,
    }),
  );
  const attemptInsert = vi.fn().mockResolvedValue({ error: null });
  const challengeInsertSelect = vi.fn().mockResolvedValue({
    data: { id: 'challenge-1' },
    error: null,
  });
  const claimMaybeSingle = vi.fn().mockResolvedValue({ data: claimed, error: null });
  const claimUpdate = vi.fn();
  const challengeRollback = vi.fn().mockResolvedValue({ error: null });
  const updateUserById = vi.fn().mockResolvedValue({ error: authError });
  const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));

  const service = {
    auth: { admin: { updateUserById } },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: profileEq,
            ilike: vi.fn(() => {
              throw new Error('profile lookup must use exact email equality');
            }),
          })),
        };
      }
      if (table === 'password_reset_attempts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: 'lookup_hash' | 'ip_hash') => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => attemptSelect(column)),
              })),
            })),
          })),
          insert: attemptInsert,
        };
      }
      if (table === 'password_reset_challenges') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: challengeInsertSelect,
            })),
          })),
          // update는 두 흐름을 모두 받는다:
          //   1) atomic claim: update({consumed_at: <iso>}).eq().is().gt().select().maybeSingle()
          //   2) rollback: update({consumed_at: null}).eq()
          update: vi.fn((payload: any) => {
            if (payload?.consumed_at === null) {
              return { eq: vi.fn(() => challengeRollback()) };
            }
            claimUpdate(payload);
            return {
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  gt: vi.fn(() => ({
                    select: vi.fn(() => ({
                      maybeSingle: claimMaybeSingle,
                    })),
                  })),
                })),
              })),
            };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  } as any;

  return {
    service,
    profileMaybeSingle,
    profileEq,
    attemptSelect,
    attemptInsert,
    challengeInsertSelect,
    updateUserById,
    claimMaybeSingle,
    claimUpdate,
    challengeRollback,
  };
}

describe('direct password reset', () => {
  it('starts a challenge for an active user whose name, phone, and email all match', async () => {
    const { service, attemptInsert } = createService();

    const result = await startDirectPasswordReset(baseInput, service, {
      ip: '203.0.113.1',
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resetToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(attemptInsert).not.toHaveBeenCalled();
  });

  it('rejects non-matching details with a generic error and records a failed attempt', async () => {
    const { service, attemptInsert } = createService({ profile: null });

    const result = await startDirectPasswordReset(baseInput, service, {
      ip: '203.0.113.1',
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });

    expect(result).toEqual({ ok: false, error: DIRECT_PASSWORD_RESET_GENERIC_ERROR });
    expect(attemptInsert).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rate limits after five failed attempts in thirty minutes', async () => {
    const { service, attemptInsert } = createService({ failedAttempts: 5 });

    const result = await startDirectPasswordReset(baseInput, service, {
      ip: '203.0.113.1',
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });

    expect(result).toEqual({ ok: false, error: DIRECT_PASSWORD_RESET_RATE_LIMIT_ERROR });
    expect(attemptInsert).not.toHaveBeenCalled();
  });

  it('does not apply a global IP failure bucket when the client IP is unavailable', async () => {
    const { service, attemptSelect } = createService({
      failedAttemptsByColumn: { lookup_hash: 0, ip_hash: 5 },
    });

    const result = await startDirectPasswordReset(baseInput, service, {
      ip: null,
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });

    expect(result.ok).toBe(true);
    expect(attemptSelect).toHaveBeenCalledTimes(1);
  });

  it('looks up profiles with exact normalized email equality', async () => {
    const { service, profileEq } = createService();

    await startDirectPasswordReset(
      { ...baseInput, email: 'USER_%@example.com' },
      service,
      {
        ip: '203.0.113.1',
        secret: 'test-secret',
        now: new Date('2026-05-18T00:00:00Z'),
      },
    );

    expect(profileEq).toHaveBeenCalledWith('email', 'user_%@example.com');
  });

  it('rejects admin or inactive accounts even if all details match', async () => {
    const { service } = createService({
      profile: { id: 'admin-1', role: 'admin', status: 'active', email: 'user@example.com', name: '홍길동', phone: '01012345678' },
    });

    const result = await startDirectPasswordReset(baseInput, service, {
      ip: '203.0.113.1',
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });

    expect(result).toEqual({ ok: false, error: DIRECT_PASSWORD_RESET_GENERIC_ERROR });
  });

  it('completes a valid challenge by atomically claiming the token', async () => {
    const { service, updateUserById, claimUpdate, challengeRollback } = createService();
    const started = await startDirectPasswordReset(baseInput, service, {
      ip: '203.0.113.1',
      secret: 'test-secret',
      now: new Date('2026-05-18T00:00:00Z'),
    });
    if (!started.ok) throw new Error('expected challenge');

    const result = await completeDirectPasswordReset(
      { resetToken: started.resetToken, newPassword: 'new-password-123' },
      service,
      {
        secret: 'test-secret',
        now: new Date('2026-05-18T00:01:00Z'),
      },
    );

    expect(result).toEqual({ ok: true });
    // claim UPDATE는 consumed_at에 ISO 시각을 박는다 (롤백이 아닌 흐름).
    expect(claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ consumed_at: '2026-05-18T00:01:00.000Z' }),
    );
    expect(updateUserById).toHaveBeenCalledWith('user-1', { password: 'new-password-123' });
    expect(challengeRollback).not.toHaveBeenCalled();
  });

  it('rejects when atomic claim returns no row (expired / already consumed / racing request)', async () => {
    // 토큰이 만료됐거나 다른 요청이 먼저 소진했으면 atomic UPDATE의 WHERE 절이
    // 매칭되지 않아 returning 0행을 받는다. claimed=null로 그 상태를 흉내낸다.
    const { service, updateUserById, challengeRollback } = createService({ claimed: null });

    const result = await completeDirectPasswordReset(
      { resetToken: 'stale-token', newPassword: 'new-password-123' },
      service,
      {
        secret: 'test-secret',
        now: new Date('2026-05-18T00:01:00Z'),
      },
    );

    expect(result).toEqual({ ok: false, error: DIRECT_PASSWORD_RESET_GENERIC_ERROR });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(challengeRollback).not.toHaveBeenCalled();
  });

  it('rolls back the consume mark when updateUserById fails so the same token can be retried', async () => {
    const { service, challengeRollback } = createService({
      authError: { message: 'auth service unavailable' },
    });

    const result = await completeDirectPasswordReset(
      { resetToken: 'valid-token', newPassword: 'new-password-123' },
      service,
      {
        secret: 'test-secret',
        now: new Date('2026-05-18T00:01:00Z'),
      },
    );

    expect(result).toEqual({ ok: false, error: 'auth service unavailable' });
    expect(challengeRollback).toHaveBeenCalled();
  });
});
