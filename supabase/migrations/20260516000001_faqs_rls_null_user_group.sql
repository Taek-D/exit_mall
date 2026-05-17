-- 2026-05-16 fix: NULL user_group은 app 레이어(middleware/_guards/UI)에서
-- group1으로 폴백 처리된다. RLS도 동일하게 NULL을 group1로 취급해야
-- 백필 누락이나 setUserStatus 단독 호출 경로로 user_group이 비어 있는
-- 정상 사용자가 /guide/faq 에서 빈 결과만 받는 미스매치가 해소된다.

drop policy if exists faqs_user_select on public.faqs;

create policy faqs_user_select on public.faqs
  for select to authenticated
  using (
    audience = 'user'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and faqs.user_groups @> array[coalesce(p.user_group, 'group1')]
    )
  );
