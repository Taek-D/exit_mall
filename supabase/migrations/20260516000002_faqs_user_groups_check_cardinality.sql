-- 2026-05-16 fix: array_length(user_groups, 1)는 빈 배열에 대해 NULL을
-- 반환하고, PostgreSQL CHECK 제약은 NULL 결과를 통과시킨다. 따라서 직전 제약은
-- audience='user'인 행이 user_groups가 NULL 또는 빈 배열이어도 silently 허용해
-- 어느 사용자에게도 보이지 않는 유령 FAQ가 만들어질 수 있었다.
--
-- cardinality()는 빈 배열에 대해 0(NULL 아님)을 반환하므로 비교가 FALSE로
-- 평가된다. NULL user_groups 케이스는 `is not null` 가드로 명시적으로
-- 처리해 표현식이 NULL이 아닌 FALSE를 반환하도록 한다.

alter table public.faqs drop constraint if exists faqs_user_groups_required;

alter table public.faqs add constraint faqs_user_groups_required
  check (
    (audience = 'admin' and user_groups is null)
    or (audience = 'user' and user_groups is not null and cardinality(user_groups) >= 1)
  );
