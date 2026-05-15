-- 0. set_updated_at 트리거 함수 (이전 마이그레이션에 없으므로 여기서 정의)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. profiles에 가이드 안내 배너 dismiss 시각 추가
alter table public.profiles
  add column guide_banner_dismissed_at timestamptz null;

comment on column public.profiles.guide_banner_dismissed_at is
  '가이드 안내 배너를 닫은 시각. NULL이면 다음 진입 시 1회 노출.';

-- 2. faqs 테이블
create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null check (audience in ('user', 'admin')),
  user_groups text[] null,
  category    text not null,
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users(id),
  updated_by  uuid not null references auth.users(id)
);

alter table public.faqs add constraint faqs_user_groups_required
  check (
    (audience = 'admin' and user_groups is null)
    or (audience = 'user' and array_length(user_groups, 1) >= 1)
  );

create index faqs_audience_category_sort_idx
  on public.faqs (audience, category, sort_order);

-- 3. updated_at 트리거 (기존 set_updated_at 함수 재사용)
create trigger faqs_set_updated_at
  before update on public.faqs
  for each row execute function public.set_updated_at();

-- 4. RLS
alter table public.faqs enable row level security;

create policy faqs_user_select on public.faqs
  for select to authenticated
  using (
    audience = 'user'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.user_group is not null
        and faqs.user_groups @> array[p.user_group]
    )
  );

create policy faqs_admin_all on public.faqs
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );
