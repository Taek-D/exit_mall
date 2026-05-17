-- Direct password reset without Supabase email delivery.
-- Stores only hashed lookup/IP values and hashed reset tokens.

create table if not exists public.password_reset_attempts (
  id bigserial primary key,
  lookup_hash text not null,
  ip_hash text not null,
  success boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists password_reset_attempts_lookup_idx
  on public.password_reset_attempts (lookup_hash, success, occurred_at desc);

create index if not exists password_reset_attempts_ip_idx
  on public.password_reset_attempts (ip_hash, success, occurred_at desc);

alter table public.password_reset_attempts enable row level security;

drop policy if exists password_reset_attempts_admin_all on public.password_reset_attempts;
create policy password_reset_attempts_admin_all on public.password_reset_attempts
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.password_reset_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  lookup_hash text not null,
  ip_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_challenges_user_idx
  on public.password_reset_challenges (user_id, created_at desc);

create index if not exists password_reset_challenges_token_idx
  on public.password_reset_challenges (token_hash);

create index if not exists password_reset_challenges_expiry_idx
  on public.password_reset_challenges (expires_at)
  where consumed_at is null;

alter table public.password_reset_challenges enable row level security;

drop policy if exists password_reset_challenges_admin_all on public.password_reset_challenges;
create policy password_reset_challenges_admin_all on public.password_reset_challenges
  for all using (public.is_admin()) with check (public.is_admin());
