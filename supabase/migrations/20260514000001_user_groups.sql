-- supabase/migrations/20260514000001_user_groups.sql
-- profiles.user_group: 1그룹(전체) / 2그룹(배송대행 전용) / NULL(미지정)

alter table public.profiles
  add column user_group text
    check (user_group in ('group1','group2'));

create index profiles_user_group_idx on public.profiles (user_group);

-- 기존 active 사용자는 모두 group1로 백필
update public.profiles
   set user_group = 'group1'
 where status = 'active'
   and user_group is null;
