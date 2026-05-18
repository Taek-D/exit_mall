import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const DIRECT_PASSWORD_RESET_GENERIC_ERROR =
  '입력하신 정보와 일치하는 재설정 가능 계정을 찾을 수 없습니다.';
export const DIRECT_PASSWORD_RESET_RATE_LIMIT_ERROR =
  '비밀번호 재설정 시도가 너무 많습니다. 30분 후 다시 시도해주세요.';

const RESET_WINDOW_SECONDS = 30 * 60;
const RESET_ATTEMPT_LIMIT = 5;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

type ServiceClient = {
  auth: {
    admin: {
      updateUserById: (
        userId: string,
        attributes: { password: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  from: (table: string) => any;
};

type ResetContext = {
  ip?: string | null;
  secret: string;
  now?: Date;
};

type CompleteContext = {
  secret: string;
  now?: Date;
};

type Profile = {
  id: string;
  role: string;
  status: string;
  email: string;
  name: string;
  phone: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

function normalizeName(name: string) {
  return name.trim();
}

function hmac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function lookupHash(input: { email: string; phone: string }, secret: string) {
  return hmac(`${normalizeEmail(input.email)}|${normalizePhone(input.phone)}`, secret);
}

function ipHash(ip: string | null | undefined, secret: string, fallbackScope: string) {
  return hmac(ip ? `ip:${ip}` : `missing-ip:${fallbackScope}`, secret);
}

async function countRecentFailures(
  service: ServiceClient,
  hashColumn: 'lookup_hash' | 'ip_hash',
  hashValue: string,
  now: Date,
) {
  const since = new Date(now.getTime() - RESET_WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await service
    .from('password_reset_attempts')
    .select('*', { count: 'exact', head: true })
    .eq(hashColumn, hashValue)
    .eq('success', false)
    .gte('occurred_at', since);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function recordFailedAttempt(
  service: ServiceClient,
  input: { email: string; phone: string },
  context: ResetContext,
) {
  const { error } = await service.from('password_reset_attempts').insert({
    lookup_hash: lookupHash(input, context.secret),
    ip_hash: ipHash(context.ip, context.secret, lookupHash(input, context.secret)),
    success: false,
  });
  if (error) throw new Error(error.message);
}

function matchesProfile(
  profile: Profile | null,
  input: { name: string; phone: string; email: string },
) {
  if (!profile) return false;
  return (
    profile.role === 'user' &&
    profile.status === 'active' &&
    safeEqual(normalizeEmail(profile.email), normalizeEmail(input.email)) &&
    safeEqual(normalizeName(profile.name), normalizeName(input.name)) &&
    safeEqual(normalizePhone(profile.phone), normalizePhone(input.phone))
  );
}

export async function startDirectPasswordReset(
  input: { name: string; phone: string; email: string },
  service: ServiceClient,
  context: ResetContext,
): Promise<{ ok: true; resetToken: string } | { ok: false; error: string }> {
  const now = context.now ?? new Date();
  const targetLookupHash = lookupHash(input, context.secret);
  const targetIpHash = ipHash(context.ip, context.secret, targetLookupHash);
  const lookupFailures = await countRecentFailures(
    service,
    'lookup_hash',
    targetLookupHash,
    now,
  );
  const ipFailures = context.ip
    ? await countRecentFailures(service, 'ip_hash', targetIpHash, now)
    : 0;

  if (lookupFailures >= RESET_ATTEMPT_LIMIT || ipFailures >= RESET_ATTEMPT_LIMIT) {
    return { ok: false, error: DIRECT_PASSWORD_RESET_RATE_LIMIT_ERROR };
  }

  const { data: profile, error } = await service
    .from('profiles')
    .select('id,role,status,email,name,phone')
    .eq('email', normalizeEmail(input.email))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!matchesProfile(profile, input)) {
    await recordFailedAttempt(service, input, context);
    return { ok: false, error: DIRECT_PASSWORD_RESET_GENERIC_ERROR };
  }

  const resetToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const { error: insertError } = await service
    .from('password_reset_challenges')
    .insert({
      user_id: profile.id,
      token_hash: hashToken(resetToken),
      lookup_hash: targetLookupHash,
      ip_hash: targetIpHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError) throw new Error(insertError.message);
  return { ok: true, resetToken };
}

export async function completeDirectPasswordReset(
  input: { resetToken: string; newPassword: string },
  service: ServiceClient,
  context: CompleteContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = context.now ?? new Date();
  const { data: challenge, error } = await service
    .from('password_reset_challenges')
    .select('id,user_id,expires_at,consumed_at')
    .eq('token_hash', hashToken(input.resetToken))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (
    !challenge ||
    challenge.consumed_at ||
    new Date(challenge.expires_at).getTime() <= now.getTime()
  ) {
    return { ok: false, error: DIRECT_PASSWORD_RESET_GENERIC_ERROR };
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    challenge.user_id,
    { password: input.newPassword },
  );
  if (updateError) return { ok: false, error: updateError.message };

  const { error: consumeError } = await service
    .from('password_reset_challenges')
    .update({ consumed_at: now.toISOString() })
    .eq('id', challenge.id);
  if (consumeError) throw new Error(consumeError.message);

  return { ok: true };
}

export function getDirectPasswordResetSecret() {
  return (
    process.env.PASSWORD_RESET_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'development-password-reset-secret'
  );
}
