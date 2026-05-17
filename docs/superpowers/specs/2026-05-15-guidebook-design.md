# 사용자/관리자 가이드북 — 설계 스펙

작성일: 2026-05-15
대상 시스템: 엑시트몰 (Next.js 14 App Router + Supabase)

---

## 1. 개요

사용자(group1/group2)와 관리자가 엑시트몰의 개념·흐름을 빠르게 익히고, 운영 중에 자주 묻는 질문을 참조할 수 있도록 **앱 내장 가이드북**을 추가한다. 가이드북은 두 부분으로 구성된다.

- **입문 가이드** — 흐름과 핵심 개념을 한 페이지로 설명하는 정적 콘텐츠. 사용자 그룹·관리자 권한별로 다른 본문 노출.
- **FAQ** — 자주 묻는 질문을 카테고리별로 정리한 동적 콘텐츠. 관리자가 등록·수정·삭제 가능.

## 2. 목적

1. 신규 가입자가 가입 승인 직후 "예치금이 뭐고 두 흐름이 어떻게 다른가"를 빠르게 익힐 수 있게 한다.
2. 기존 사용자가 운영 중 "이거 어디서 하지?"를 빠르게 찾을 수 있게 한다.
3. 관리자가 가입 승인·입금·주문·배송대행 등 일상 업무를 일관되게 처리할 수 있도록 운영 매뉴얼을 제공한다.

## 3. 사용자 결정 요약 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 형식 | 앱 내장 웹 페이지 |
| 1차 목적 | 신규 가입자 온보딩 + FAQ 참조 |
| 분리 방식 | 별도 URL (`/guide`, `/admin/guide`), 사용자 측은 group1/group2 자동 분기 |
| 입문 본문 작성 | TSX 컴포넌트 (코드 하드코딩) |
| FAQ 작성 | DB 저장 + 관리자 UI 편집 |
| 페이지 구조 | 입문은 단일 페이지, FAQ는 별도 페이지 |
| 진입점 | 사이드바 메뉴 항목 + 첫 로그인 dismissible 배너 |
| 스크린샷 | 없음. 텍스트 + 인앱 라우트 링크 |
| FAQ 노출 대상 | 사용자/관리자 분리 + 사용자용은 group1/group2 다중 선택 |
| FAQ 카테고리 | 코드 enum 고정 |
| FAQ 정렬 | `sort_order` 정수 필드, 관리자가 직접 입력 |
| FAQ 검색 | `ILIKE` 단순 매치 (question + answer) |
| 배너 dismiss 저장 | `profiles.guide_banner_dismissed_at` 컬럼 |

## 4. 콘텐츠 범위

### `/guide` (group1 — 엑시트몰 전체)
1. 시작하기 — 가입·승인 흐름, 예치금 충전을 첫 단계로 안내
2. 흐름 1: 상품 구매 (재고 적립) — `/shop` → 장바구니 → 검토 요청 → 승인 후 보유 재고 적립. 1인 한도, 검토대기 예약 개념
3. 흐름 2: 배송대행 (엑시트몰) — 양식 엑셀 다운로드 → 명단 작성 → 업로드/미리보기 → 검토 요청 → 송장 확인. 행별 상품명 매칭 규칙
4. 보유 재고 — 엑시트몰 + 수기 재고 통합 보기, 가용/예약/총보유, 변동 내역
5. 입고 요청 게시판 — 사입 상품 입고 요청 작성, 엑셀 양식, 댓글로 진행상황 추적
6. 예치금 — 충전 요청, 가용/예약 분리 의미
7. 계정 관리 — 비밀번호 변경, 아이디 찾기, 비밀번호 재설정

### `/guide` (group2 — 배송대행 전용)
1. 시작하기 — group2의 사용 범위 안내(상점/엑시트몰 흐름 차단)
2. 사입재고 배송대행 — *현재 준비중*. 흐름 개요만 미리 설명, 출시 시점에 상세 추가
3. 입고 요청 게시판 — group1과 동일 내용
4. 계정 관리 — group1과 동일 내용

### `/admin/guide` (관리자)
1. 시작하기 — 관리자 업무 한눈에 보기, Realtime 알림 활용
2. 가입 승인 — 승인/거절/그룹 배정(group1/group2), 재신청자 식별
3. 입금 확인 — 이체 요청 검토, 예치금 반영
4. 상품 관리 — CRUD, 1인 한도, 이미지 업로드, 비활성 토글, 소프트 삭제·복구
5. 상품 엑셀 가져오기 — 업로드 → 미리보기 검증 → 적용 단계
6. 주문 관리 (`stock_orders`) — 검토/승인/반려, 승인 시 재고/예치금 처리 원리
7. 배송대행 관리 (엑시트몰) — 검토 → 승인/반려 → 송장 재업로드 → 완료. 배송비/재고 처리 원리
8. 입고 요청 관리 — 상태 변경, 댓글 응답, 첨부 확인
9. 사용자 관리 — 잔액 조정, 임계치, 그룹 변경, 수기 재고 등록·조정
10. 잔액 부족 고객 / 설정 — 잔액 부족 목록, 입금 계좌 설정
11. Legacy 화면 안내 — `/admin/orders-legacy` 등은 열람 전용이라는 짧은 안내

### FAQ
관리자가 운영하면서 등록한다. 초기 시드는 위 카테고리 기준으로 10~15개로 시작하고 점진 확장한다.

## 5. 라우트 & 진입점

### 사용자 측 라우트

| 라우트 | 목적 | 접근 권한 |
|---|---|---|
| `/guide` | 입문 가이드 — 본인 그룹에 맞는 내용 자동 노출 | 로그인 + `status=active` |
| `/guide/faq` | FAQ — 본인 그룹에 노출 설정된 항목만 | 로그인 + `status=active` |

`/guide`는 단일 라우트로 두고 Server Component에서 `profiles.user_group`을 읽어 `<Group1Guide />` 또는 `<Group2Guide />`를 분기 렌더한다. 관리자가 `/guide`에 직접 접근하면 group1 가이드를 기본 노출하고 상단에 "group2 가이드 보기 →" 토글 링크를 둔다. 이 토글은 `?as=group2` 쿼리 파라미터로 처리하며, 서버에서 `role='admin'`일 때만 이 파라미터를 반영한다 (일반 사용자가 같은 파라미터를 시도해도 무시되어 본인 그룹만 노출).

### 관리자 측 라우트

| 라우트 | 목적 |
|---|---|
| `/admin/guide` | 관리자 입문 가이드 본문 |
| `/admin/guide/faq` | 관리자용 FAQ (읽기 전용 미리보기) |
| `/admin/guide/faq/manage` | FAQ 등록·수정·삭제 관리 |

### 진입점

1. **사이드바 메뉴 항목**
   - `NavUser` 사용자 사이드바에 "가이드" 항목 추가 (group1·group2 모두)
   - 관리자 사이드바(`NavAdmin`)에 "관리자 가이드"와 "FAQ 관리" 항목 추가

2. **첫 로그인 배너**
   - `profiles.guide_banner_dismissed_at`이 NULL이고 `status=active`인 사용자에게 사용자 페이지 상단에 dismissible 배너 1회 노출
   - 배너 텍스트: "처음이시면 가이드를 먼저 읽어보세요" + [가이드 열기] [닫기]
   - [가이드 열기] → `/guide` 이동
   - [닫기] → Server Action으로 `guide_banner_dismissed_at = now()` 기록
   - 관리자에게도 동일 배너 1회 노출

## 6. 데이터 모델

### `profiles` 컬럼 추가
```sql
alter table public.profiles
  add column guide_banner_dismissed_at timestamptz null;
```
- NULL이면 배너 노출, 값이 있으면 미노출
- 별도 인덱스 불필요 (사용자별 단일 row 조회)

### `faqs` 테이블 신설
```sql
create table public.faqs (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null check (audience in ('user', 'admin')),
  user_groups  text[] null,
  category     text not null,
  question     text not null,
  answer       text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid not null references auth.users(id),
  updated_by   uuid not null references auth.users(id)
);

alter table public.faqs add constraint faqs_user_groups_required
  check (
    (audience = 'admin' and user_groups is null)
    or (audience = 'user' and array_length(user_groups, 1) >= 1)
  );

create index faqs_audience_category_sort_idx
  on public.faqs (audience, category, sort_order);

create trigger faqs_set_updated_at
  before update on public.faqs
  for each row execute function public.set_updated_at();
```

- `user_groups`는 audience='user'일 때만 사용하며 `{group1}`, `{group2}`, `{group1,group2}` 중 하나
- `answer`는 markdown 허용. 클라이언트는 sanitize 후 렌더링한다 (섹션 8 참고)
- 카테고리 enum 검증은 앱 레이어(Zod). DB는 text 자유.

### 카테고리 enum (앱 상수, `lib/guide/categories.ts`)

사용자용:
- `getting-started`, `purchase`, `shipping-upload`, `inventory`, `inbound`, `deposit`, `account`

관리자용:
- `getting-started`, `approvals`, `deposits`, `products`, `orders`, `shipping-upload`, `inbound`, `users`, `etc`

각 키에 대응하는 한국어 label을 같은 파일에서 매핑한다.

## 7. 컴포넌트 / 페이지 구조

```
app/
  guide/
    page.tsx
    faq/
      page.tsx
  admin/
    guide/
      page.tsx
      faq/
        page.tsx
        manage/
          page.tsx

components/
  guide/
    Group1Guide.tsx
    Group2Guide.tsx
    AdminGuide.tsx
    GuideTOC.tsx
    GuideSection.tsx
    FaqList.tsx
    FaqItem.tsx
    FaqEditor.tsx
    GuideBanner.tsx

lib/
  guide/
    categories.ts
    faqs.ts
    banner.ts
```

### `/guide` 페이지 흐름
1. Server Component에서 본인 profile 조회 → `user_group` 확인
2. `user_group === 'group2'`이면 `<Group2Guide />`, 아니면 `<Group1Guide />` 렌더 (관리자는 group1 가이드 기본)
3. 데스크톱: 좌측 sticky `<GuideTOC />` + 우측 본문 (12-grid, 4:8). 모바일: 본문만 + 상단 토글식 목차
4. 본문 내 인앱 링크는 `next/link`의 `<Link>` 사용, 같은 탭 이동

### `/guide/faq` 페이지 흐름
1. Server Component에서 `getUserFaqs({ userGroup, category, query })` 호출
2. 카테고리별 그룹화하여 `<FaqList />` 렌더
3. 검색어·카테고리 필터는 URL `?q=&category=`로 동기화. 변경 시 `router.replace()`로 서버 재실행
4. 항목은 기본 접힘. 클릭으로 펼침. 여러 항목 동시 펼침 허용
5. answer는 `react-markdown` + `remark-gfm` + `rehype-sanitize`로 렌더링

### `/admin/guide/faq/manage` 페이지 흐름
1. 목록 테이블 (카테고리/audience/groups/질문/순서/수정일)
2. 상단 [새 FAQ 등록] → drawer로 `<FaqEditor />` 열림
3. 각 행 [수정] / [삭제]. 삭제는 인라인 confirm (모달 중첩 금지)
4. 폼 필드: audience(select) / user_groups(체크박스, 사용자 audience일 때만 활성) / category(select) / question / answer(markdown 텍스트영역) / sort_order
5. Server Action 저장 후 toast + `revalidatePath` + drawer 닫힘

### `<GuideBanner />` 흐름
1. 인증 영역 공통 layout에서 server-side로 `guide_banner_dismissed_at` NULL 여부 확인
2. NULL이면 dismissible 배너 노출
3. 닫기 클릭 → `dismissGuideBanner()` server action → 컬럼 업데이트 → `router.refresh()`

## 8. Server Actions & 데이터 흐름

```ts
// lib/guide/faqs.ts
getUserFaqs(params: {
  userGroup: 'group1' | 'group2'
  category?: UserFaqCategory
  query?: string
}): Promise<Faq[]>
// audience='user' AND user_groups @> ARRAY[userGroup]
// + 카테고리/검색 필터, ORDER BY category, sort_order ASC

getAdminFaqs(params: {
  audience?: 'user' | 'admin'
  category?: string
  query?: string
}): Promise<Faq[]>
// 권한: role='admin' 검증

getFaqById(id: string): Promise<Faq | null>

createFaq(input: FaqInput): ActionResult<{ id: string }>
updateFaq(id: string, input: FaqInput): ActionResult
deleteFaq(id: string): ActionResult

// lib/guide/banner.ts
dismissGuideBanner(): ActionResult
// 본인 row만 profiles.guide_banner_dismissed_at = now()
```

`FaqInput` Zod 스키마:
- `audience`: `'user' | 'admin'`
- `user_groups`: audience='user'면 `('group1' | 'group2')[]`, 길이 1 이상. 'admin'이면 null
- `category`: audience별 허용 enum set에서 검증
- `question`: 1~200자
- `answer`: 1~5000자
- `sort_order`: 정수, 기본 0

`ActionResult`는 기존 프로젝트 패턴(`{ ok: true, data? }` / `{ ok: false, error, fieldErrors? }`)을 따른다.

### 캐싱
- 입문 가이드 본문 자체는 코드 상수이지만 페이지는 본인 `user_group` 분기 + 인증 의존이라 dynamic rendering이 된다. 별도 캐싱 설정 없이 Next.js 기본 동작에 맡긴다.
- FAQ 페이지: `dynamic = 'force-dynamic'` (그룹·검색어에 따라 변함)
- FAQ 매니지 페이지: `force-dynamic`

### 에러 처리
- 권한 위반 → server action 진입 즉시 throw → 일반 에러 페이지 fallback
- Zod 실패 → fieldErrors 반환 → 폼 인라인 표시
- DB 제약 위반 → 일반 에러 메시지 + 로그

## 9. 권한·RLS·라우트 가드·보안

### RLS — `faqs` 테이블

```sql
alter table public.faqs enable row level security;

-- 1. 사용자: audience='user' AND 본인 user_group이 포함된 항목만 SELECT
create policy faqs_user_select on public.faqs
  for select to authenticated
  using (
    audience = 'user'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.user_group is not null
        and user_groups @> array[p.user_group]
    )
  );

-- 2. 관리자: 모든 항목 ALL
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
```

`profiles.guide_banner_dismissed_at`은 기존 profiles RLS(본인 row만 UPDATE)를 그대로 따른다.

### 미들웨어 라우트 가드

| 라우트 | group1 | group2 | admin | 비로그인 |
|---|---|---|---|---|
| `/guide` | ✅ | ✅ | ✅ | → `/login` |
| `/guide/faq` | ✅ | ✅ | ✅ | → `/login` |
| `/admin/guide` | ❌ | ❌ | ✅ | → `/login` |
| `/admin/guide/faq` | ❌ | ❌ | ✅ | → `/login` |
| `/admin/guide/faq/manage` | ❌ | ❌ | ✅ | → `/login` |

- `/admin/*`는 기존 admin role 가드가 자동 적용된다
- group2 차단 경로 추가 불필요 (admin 가드로 차단됨)

### 보안 체크포인트
1. **answer markdown XSS**: `react-markdown` + `rehype-sanitize`. 허용 태그 화이트리스트(p, strong, em, a, ul, ol, li, code, pre, blockquote, h3, h4)
2. **외부 링크**: `a` 태그는 `target="_blank" rel="noopener noreferrer"` 자동 부여
3. **server action 권한 가드**: `createFaq`/`updateFaq`/`deleteFaq`는 진입 즉시 `requireAdmin()` (기존 `lib/actions/_guards.ts` 패턴 따름)
4. **`dismissGuideBanner`**: `requireAuth()`로 status=active 검증. 본인 row만 업데이트
5. **카테고리 검증**: Zod에서 audience별 허용 set으로 검증
6. **`user_groups` 값**: `group1` / `group2` 외 차단
7. **검색 입력**: Supabase 클라이언트의 `.ilike()` 파라미터 바인딩 사용. raw SQL concat 금지

Rate limit은 불필요하다 — FAQ 작성은 관리자 한정, 배너 dismiss는 본인 1회성.

## 10. 테스트 전략

### 단위 테스트 (Vitest)
| 대상 | 검증 내용 |
|---|---|
| FAQ Zod 스키마 | audience='user'면 user_groups 1개 이상 / 'admin'이면 null / 카테고리 매칭 / 길이 |
| `lib/guide/categories.ts` | 사용자/관리자 카테고리 set 분리, label 매핑 |
| `getUserFaqs` 필터링 | group1 사용자가 `{group2}`만 노출된 항목을 못 봄, 카테고리 필터 동작 |
| markdown sanitize | `<script>`, `onerror=`, `javascript:` URL 차단 |
| 권한 가드 | 일반 사용자가 `createFaq` 호출 시 throw |

### E2E (Playwright)
| 시나리오 | 흐름 |
|---|---|
| group1 사용자 가이드 | 로그인 → `/guide`에서 group1 본문 → `/guide/faq`에서 본인 그룹 항목만 |
| group2 사용자 가이드 | 로그인 → `/guide`에서 group2 본문(준비중 안내 포함) |
| 첫 로그인 배너 | 신규 사용자 진입 시 배너 노출 → 닫기 → 새로고침 시 미노출 |
| 관리자 FAQ 등록 | `/admin/guide/faq/manage/new` → 저장 → 목록 노출 + 해당 그룹 사용자 페이지에서 노출 |
| FAQ 수정/삭제 | 변경 반영 / 삭제 시 사용자 페이지에서도 사라짐 |
| 권한 우회 차단 | group1 사용자가 `/admin/guide/faq/manage` 직접 접근 → 차단 |

기존 `tests/e2e/user-groups.spec.ts` 패턴을 차용한다.

## 11. 마이그레이션 & 배포

### 마이그레이션 파일
`supabase/migrations/<timestamp>_guide_banner_and_faqs.sql` — 다음 항목을 단일 마이그레이션에 포함:
1. `profiles.guide_banner_dismissed_at` 컬럼 추가
2. `faqs` 테이블 + check constraint + 인덱스
3. RLS 활성화 + 정책 두 개
4. `updated_at` 트리거

`public.set_updated_at()` 트리거 함수가 기존 마이그레이션에 정의되어 있는지 plan 단계에서 확인한다. 없다면 동일 마이그레이션에 함수 정의를 포함한다.

### 의존성 확인
플랜 단계에서 다음 의존성이 `package.json`에 있는지 확인하고, 없다면 추가한다:
- `react-markdown`
- `remark-gfm`
- `rehype-sanitize`

### 시드 데이터
운영 데이터와 분리하기 위해 `scripts/seed-faqs.ts` 같은 일회성 스크립트로 초기 FAQ 예시 5~10개를 등록한다. 마이그레이션에는 INSERT를 포함하지 않는다.

### 배포 순서
1. PR 머지 → Vercel 배포 + Supabase 마이그레이션 적용
2. 마이그레이션은 nullable 컬럼 추가 + 신규 테이블이라 backward-compat. 기존 사용자 데이터에 영향 없음
3. 기존 active 사용자는 `guide_banner_dismissed_at`이 NULL이므로 첫 진입 시 배너가 1회 노출됨. **백필하지 않는다** — 가이드 신규 도입 사실을 알리는 효과를 의도한다.
4. 운영자가 `/admin/guide/faq/manage`에서 초기 FAQ를 작성한다.

## 12. 작업 분량 추정

- 마이그레이션 + RLS: 1 commit
- 카테고리 enum + Zod + server actions + 권한 가드: 2~3 commits
- `Group1Guide` / `Group2Guide` / `AdminGuide` TSX 본문 작성: 3 commits (콘텐츠 작성이 본업)
- `/guide`, `/guide/faq` 페이지 + `FaqList`: 1~2 commits
- `/admin/guide`, FAQ 매니지 페이지 + `FaqEditor`: 2 commits
- 사이드바 메뉴 항목 + 배너 컴포넌트 + dismiss action: 1 commit
- 단위 테스트 + E2E: 1~2 commits

## 13. 범위 밖

- 다국어(i18n) 지원 — 한국어 단일
- PDF/인쇄용 출력
- 비로그인 상태에서의 가이드 열람
- 가이드 본문의 관리자 편집 UI (입문 본문은 코드 변경으로 처리)
- FAQ 항목의 소프트 삭제·복구 (하드 삭제로 충분)
- FAQ 항목별 조회수/유용성 피드백 같은 분석 기능
- 가이드 본문 내 스크린샷·다이어그램 (출시 시점)
- 헬프 아이콘 / 맥락 인지 가이드 진입점

## 14. 참고

- 기존 사용자 그룹 설계: `docs/superpowers/specs/2026-05-14-user-groups-design.md`
- 디자인 시스템: `MASTER.md`
- 기존 RLS 패턴: `supabase/migrations/` 내 inbound_requests / faqs 외 정책 참고
- 권한 가드 패턴: `lib/actions/_guards.ts`
