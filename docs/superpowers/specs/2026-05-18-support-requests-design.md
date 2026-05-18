# 교환/반품 및 CS 문의 메뉴 - 디자인 스펙

- 작성일: 2026-05-18
- 브랜치: `feature/CStable`
- 산출물 종류: 디자인 스펙 (구현 전 합의)
- 선택 방향: 기존 `입고리스트`와 완전히 분리된 별도 게시판

## 1. 배경 & 목적

엑시트몰 고객이 교환, 반품, 기타 CS 문의를 운영팀에 비공개 게시글로 남기고, 운영팀이 댓글로 응답하며 처리 상태를 관리할 수 있는 전용 문의 게시판을 추가한다.

기존 `입고리스트`는 사입 입고 업무에 특화되어 있고 엑셀 첨부가 필수다. CS 문의는 주문번호, 운송장번호, 사진 등 케이스별 증빙이 달라서 입고 요청 데이터와 섞지 않고 별도 테이블, 별도 Storage bucket, 별도 RPC, 별도 라우트로 분리한다.

### 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 메뉴명 | `교환/반품 및 CS 문의` |
| 사용자 라우트 | `/support-requests` |
| 관리자 라우트 | `/admin/support-requests` |
| 공개 범위 | 비공개 - 작성자 본인 + 관리자만 |
| 데이터 구조 | `support_requests`, `support_request_comments`, `support_request_attachments` |
| 입고리스트와 관계 | DB, Storage, RPC, unread 배지 모두 분리 |
| 문의 유형 | `교환`, `반품`, `CS문의`, `기타` |
| 작성 필드 | 제목 + 문의 유형 + 참고번호(선택) + 내용 + 첨부파일(선택) |
| 상태 | `open(접수)` -> `in_progress(처리중)` -> `completed(완료)` + `cancelled(취소)` |
| 첨부 | 선택, 최대 5개, 파일당 10MB |
| 댓글 | 작성자/관리자 양방향, 완료/취소 시 잠금 |
| 알림 | 사용자/관리자 메뉴에 CS 전용 unread 배지 |
| 사용자 그룹 | `group1`, `group2` 모두 접근 가능 |

## 2. 아키텍처 & 라우팅

### 사용자 라우트 (`app/(user)/support-requests/`)

- `page.tsx` - 본인 CS 문의 목록
- `new/page.tsx` - 새 문의 작성 화면
- `new/NewSupportRequestForm.tsx` - 클라이언트 폼
- `[id]/page.tsx` - 상세, 첨부, 댓글
- `[id]/CancelSupportRequestButton.tsx` - 작성자 취소 액션

### 관리자 라우트 (`app/(admin)/admin/support-requests/`)

- `page.tsx` - 전체 CS 문의 목록, 상태/유형 필터, 작성자 검색
- `[id]/page.tsx` - 상세, 첨부, 댓글
- `[id]/StatusControls.tsx` - 관리자 상태 변경 액션

### 네비게이션 등록

- `components/NavUser.tsx`
  - `입고리스트` 다음에 `교환/반품 및 CS 문의` 추가
  - icon: `LifeBuoy`
  - `groups: ['group1', 'group2']`
  - 현재 긴 라벨 줄바꿈 패턴(`formatNavLabel`)을 사용하되, 모바일에서 텍스트가 깨지지 않도록 2줄 기준으로 확인한다.
- `components/admin-nav-items.ts`
  - `입고리스트` 다음에 `/admin/support-requests` 추가
  - 관리자 사이드바와 모바일 관리자 메뉴는 기존 `ADMIN_NAV_ITEMS`를 공유하므로 같이 반영된다.
- `lib/auth/user-groups.ts`
  - `GROUP2_ALLOWED_PREFIXES`에 `/support-requests` 추가
  - group2 사용자가 새 메뉴에 직접 접근해도 middleware에서 차단되지 않게 한다.

### 책임 분리

| 레이어 | 위치 | 역할 |
|---|---|---|
| DB | `supabase/migrations/` | CS 전용 테이블, RLS, RPC, Storage 정책 |
| 타입 | `lib/types.ts` | 상태/유형 enum, 라벨 맵 |
| 권한 | `lib/support/permissions.ts` | 상태 전이, 잠금, 수정 가능 여부 |
| 쿼리 | `lib/support/queries.ts` | 사용자/관리자 목록, 상세, unread count |
| 업로드 | `lib/support/upload-paths.ts`, `lib/support/storage.ts` | 첨부 경로와 안전 파일명 |
| 액션 | `lib/actions/support-request.ts` | 작성, 취소, 상태 변경, 댓글, 첨부 signed URL |
| UI | `app/(user|admin)/**/support-requests/**`, `components/support/**` | 화면과 상호작용 |

`입고리스트`와 데이터 로직은 공유하지 않는다. 다만 `Button`, `ConfirmDialog`, `StatusPill`, 날짜 포맷 같은 순수 UI/유틸은 기존 공통 컴포넌트를 재사용한다.

## 3. 데이터 모델

### 3.1 테이블: `support_requests`

```sql
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null
    check (category in ('exchange','return','cs','other')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 5000),
  reference_type text not null default 'none'
    check (reference_type in ('none','order','tracking','other')),
  reference_value text check (reference_value is null or length(reference_value) <= 100),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_category_idx on public.support_requests (category, created_at desc);
create index support_requests_updated_idx on public.support_requests (updated_at desc);
```

### 3.2 테이블: `support_request_comments`

```sql
create table public.support_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index support_comments_request_idx on public.support_request_comments (request_id, created_at);
```

### 3.3 테이블: `support_request_attachments`

```sql
create table public.support_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (storage_path)
);

create index support_attachments_request_idx on public.support_request_attachments (request_id, created_at);
```

첨부파일을 별도 테이블로 두면 이미지, PDF, 엑셀 등 파일 종류가 섞여도 메타데이터를 안정적으로 관리할 수 있다. 문의 본문 테이블에 배열 컬럼으로 저장하는 방식보다 삭제와 signed URL 발급 범위도 명확하다.

### 3.4 Storage bucket

```sql
insert into storage.buckets (id, name, public) values
  ('support-requests', 'support-requests', false)
  on conflict (id) do nothing;
```

경로 규칙:

```text
{user_id}/{request_id}/attachments/{attachment_id}-{safe_filename}
```

허용 파일:

- 이미지: `.jpg`, `.jpeg`, `.png`, `.webp`
- 문서: `.pdf`, `.xlsx`, `.xls`, `.docx`, `.txt`
- 최대 5개, 파일당 10MB

### 3.5 읽지 않음 카운터

- 사용자 unread: `last_comment_at > coalesce(user_last_read_at, 'epoch')` 이고 `last_comment_by_role = 'admin'`
- 관리자 unread: `last_comment_at > coalesce(admin_last_read_at, 'epoch')` 이고 `last_comment_by_role = 'user'`
- 상세 진입 시 `mark_support_read` RPC로 읽음 처리
- 관리자 unread는 기존 입고리스트와 동일하게 "관리자 중 누군가 읽으면 관리자 전체 읽음"으로 단순화한다.

### 3.6 Realtime

`support_requests`, `support_request_comments`를 `supabase_realtime` publication에 추가한다. `SupportUnreadBadge`는 두 테이블 변경을 구독하고 변경 발생 시 count RPC를 재호출한다.

## 4. RLS & RPC

### 4.1 RLS: `support_requests`

일반 사용자의 직접 insert/update는 열지 않는다. 신규 문의 생성과 상태 변경은 RPC를 통해서만 처리해서 rate limit, 상태 전이, 감사 컬럼을 한 곳에서 검증한다.

```sql
alter table public.support_requests enable row level security;

create policy support_requests_owner_admin_select on public.support_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy support_requests_self_delete on public.support_requests
  for delete using (user_id = auth.uid() and status = 'open');

create policy support_requests_admin_all on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.2 RLS: `support_request_comments`

일반 사용자의 직접 insert는 막고, 댓글 작성은 `add_support_comment` RPC로만 처리한다. RPC 내부에서 작성자 역할, 잠금 상태, rate limit을 검증한다. 댓글 수정/삭제 10분 제한은 서버 액션과 RLS 양쪽에서 확인한다.

```sql
alter table public.support_request_comments enable row level security;

create policy support_comments_select on public.support_request_comments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_comments_self_update on public.support_request_comments
  for update using (
    author_id = auth.uid()
    and created_at >= now() - interval '10 minutes'
  )
  with check (author_id = auth.uid());

create policy support_comments_self_delete on public.support_request_comments
  for delete using (
    author_id = auth.uid()
    and created_at >= now() - interval '10 minutes'
  );

create policy support_comments_admin_all on public.support_request_comments
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.3 RLS: `support_request_attachments`

```sql
alter table public.support_request_attachments enable row level security;

create policy support_attachments_select on public.support_request_attachments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_attachments_owner_insert on public.support_request_attachments
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and r.user_id = auth.uid()
        and r.status = 'open'
    )
  );

create policy support_attachments_owner_delete on public.support_request_attachments
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id and r.status = 'open'
    )
  );

create policy support_attachments_admin_all on public.support_request_attachments
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.4 Storage 정책 (`support-requests`)

```sql
create policy "support-requests owner read" on storage.objects
  for select using (
    bucket_id = 'support-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "support-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'support-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "support-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'support-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "support-requests admin all" on storage.objects
  for all using (bucket_id = 'support-requests' and public.is_admin())
  with check (bucket_id = 'support-requests' and public.is_admin());
```

### 4.5 RPC

| RPC | 호출자 | 역할 |
|---|---|---|
| `submit_support_request_rpc(category, title, body, reference_type, reference_value)` | active user | rate limit 검사 후 문의 row 생성, request id 반환 |
| `set_support_status(request_id, new_status)` | admin | 상태 전이, 행 잠금, `reviewed_by` 기록 |
| `cancel_support_request(request_id)` | 작성자(`open` 한정), admin(`open`/`in_progress`) | 허용된 진행 상태를 `cancelled`로 변경 |
| `mark_support_read(request_id)` | 작성자 또는 admin | 호출자 역할에 따라 읽음 컬럼 갱신 |
| `add_support_comment(request_id, body)` | 작성자 또는 admin | 댓글 생성, 부모 row의 last comment 컬럼 갱신 |
| `count_support_unread(p_role)` | 작성자 또는 admin | 메뉴 배지 count 반환 |
| `search_support_requests(p_q, p_status, p_category, p_limit)` | admin | 관리자 목록 검색 |

상태 전이는 다음 그래프만 허용한다.

```text
open -> in_progress -> completed
open -> cancelled
in_progress -> cancelled
```

`completed`, `cancelled`는 종결 상태다. 재오픈은 이번 범위에 포함하지 않는다.

## 5. UI 표면

### 5.1 사용자: `/support-requests`

- 헤더
  - 제목: `교환/반품 및 CS 문의`
  - 설명: "교환, 반품, 기타 문의를 비공개로 남기고 답변을 확인하세요."
- 우측 CTA: `새 문의`
- 목록
  - 상태 배지
  - 문의 유형 배지
  - 제목
  - 작성일
  - 최근 답변 시각
  - 새 답변 표시
- 빈 상태
  - `LifeBuoy` 아이콘
  - "등록된 문의가 없습니다"
  - `새 문의 작성` 버튼

### 5.2 사용자: `/support-requests/new`

폼 필드:

- 문의 유형: select control
  - `교환`, `반품`, `CS문의`, `기타`
- 제목: 필수, 1-200자
- 참고번호 유형: 선택
  - 없음, 주문번호, 운송장번호, 기타
- 참고번호 값: 선택, 100자 이하
- 내용: 필수, 1-5000자
- 첨부파일: 선택, 최대 5개

작성 성공 시 `/support-requests/[id]`로 이동한다. 첨부 업로드 실패 시 생성된 row와 partial storage 파일을 best-effort로 정리하고 사용자에게 실패 메시지를 보여준다.

### 5.3 사용자: `/support-requests/[id]`

- 뒤로가기: `교환/반품 및 CS 문의`
- 헤더: 상태 배지, 문의 유형, 제목, 작성일
- 본문 카드: 참고번호, 내용, 첨부파일
- 첨부 다운로드/이미지 열람은 60초 signed URL 사용
- 작성자 액션
  - `open` 상태에서 취소 가능
  - 글 수정은 이번 구현 범위에서 제외한다. 잘못 쓴 문의는 취소 후 새 글로 작성한다.
- 댓글 스레드
  - 작성자/관리자 역할 구분
  - 본인 댓글은 10분 이내 수정/삭제 가능
- 댓글 입력
  - `open`, `in_progress`에서 활성
  - `completed`, `cancelled`에서는 잠금 안내

### 5.4 관리자: `/admin/support-requests`

- 헤더: `교환/반품 및 CS 문의`
- 필터
  - 상태 탭: 전체, 접수, 처리중, 완료, 취소
  - 문의 유형: 전체, 교환, 반품, CS문의, 기타
  - 작성자 이름/이메일 검색
- 테이블 컬럼
  - 상태
  - 유형
  - 제목
  - 작성자
  - 최근 활동
  - 작성일
- 사용자 새 댓글이 있으면 `새 댓글` 표시

### 5.5 관리자: `/admin/support-requests/[id]`

- 사용자 정보: 이름, 이메일
- 상태 변경 액션
  - `open` -> `처리중`, `취소`
  - `in_progress` -> `완료`, `취소`
  - 종결 상태 -> 액션 없음
- 첨부파일 다운로드
- 댓글 답변
- 상세 진입 시 관리자 읽음 처리

### 5.6 공통 컴포넌트

- `components/support/SupportStatusBadge.tsx`
- `components/support/SupportCategoryBadge.tsx`
- `components/support/SupportAttachmentList.tsx`
- `components/support/SupportCommentList.tsx`
- `components/support/SupportCommentForm.tsx`
- `components/support/SupportUnreadBadge.tsx`

기존 `components/inbound/**`를 직접 가져다 쓰지 않는다. CS 화면은 추후 독립적으로 변경될 가능성이 높기 때문에 이름과 데이터 타입을 분리한다.

## 6. 데이터 플로우

### 6.1 신규 문의 작성

```text
[Client: /support-requests/new]
  -> FormData 제출
  -> submitSupportRequestAction
      -> 로그인/active 사용자 확인
      -> Zod 검증
      -> 파일 개수/확장자/용량 검증
      -> rpc('submit_support_request_rpc')로 request row 생성
      -> Storage bucket 'support-requests'에 첨부 업로드
      -> support_request_attachments metadata insert
      -> 실패 시 partial 파일 제거 + request row 삭제
      -> revalidatePath('/support-requests')
      -> requestId 반환
  -> 성공 toast
  -> /support-requests/[id] 이동
```

첨부는 선택이므로 파일이 없어도 문의는 등록된다.

### 6.2 댓글 작성

```text
[SupportCommentForm]
  -> addSupportCommentAction(requestId, body)
      -> Zod 검증
      -> rpc('add_support_comment')
          -> request row for update
          -> 권한 확인
          -> 상태 잠금 확인
          -> author_role 결정
          -> comment insert
          -> support_requests.last_comment_* 갱신
      -> 상세 경로 revalidate
```

### 6.3 관리자 상태 변경

```text
[StatusControls]
  -> setSupportStatusAction(requestId, nextStatus)
      -> rpc('set_support_status')
          -> admin 확인
          -> request row for update
          -> 상태 전이 검증
          -> status/reviewed_by/updated_at 갱신
      -> 사용자/관리자 상세 및 목록 revalidate
```

### 6.4 읽음 배지

```text
[SupportUnreadBadge]
  -> 최초 count_support_unread 호출
  -> support_requests/support_request_comments Realtime 구독
  -> 변경 감지 시 debounce 후 count 재조회

[상세 페이지 진입]
  -> markSupportReadAction(requestId)
      -> rpc('mark_support_read')
      -> role에 맞는 last_read_at 갱신
```

## 7. 에러 처리 & 엣지 케이스

### 7.1 입력 검증

- 제목: 1-200자
- 내용: 1-5000자
- 참고번호: 100자 이하
- 댓글: 1-2000자
- 첨부: 최대 5개, 파일당 10MB
- 클라이언트 검증은 UX용이며 서버 액션에서 항상 재검증한다.

### 7.2 첨부 실패

- 요청 row 생성 후 첨부 업로드가 실패할 수 있다.
- 서버 액션은 이미 올라간 storage 파일을 삭제하고, 생성한 `support_requests` row도 삭제한다.
- 삭제 실패는 로그로 남기고 사용자에게는 "문의 등록에 실패했습니다. 다시 시도해주세요."를 보여준다.

### 7.3 접근 제어

- 다른 사용자의 문의 URL 직접 접근: RLS로 0 row, 화면은 `notFound()`
- 관리자 페이지 직접 접근: middleware의 admin guard 유지
- group2 사용자는 `/support-requests`만 허용 prefix에 추가하고, 관리자 경로는 접근 불가

### 7.4 댓글 잠금

- `completed`, `cancelled` 상태에서는 RPC가 `LOCKED` 에러를 반환한다.
- UI도 입력창을 비활성화하지만, 최종 보장은 DB/RPC에서 한다.

### 7.5 동시성

- 상태 변경과 댓글 작성 RPC는 부모 row를 `for update`로 잠근다.
- 관리자가 완료 처리하는 순간 사용자가 댓글을 제출하면 RPC가 상태를 다시 확인하고 `LOCKED`를 반환한다.

### 7.6 XSS / 콘텐츠 안전

- 제목, 본문, 댓글은 plain text로 렌더링한다.
- Markdown/HTML은 지원하지 않는다.
- 본문과 댓글은 `whitespace-pre-wrap`으로 줄바꿈만 보존한다.

### 7.7 signed URL

- 첨부는 private bucket에 저장한다.
- 다운로드/이미지 미리보기는 `getSupportAttachmentUrlAction(requestId, attachmentId)`로 60초 signed URL을 발급한다.
- 서버 액션은 attachment row와 request row를 함께 조회해서 권한을 확인한다.

### 7.8 Rate limit

- 신규 문의: 사용자당 분당 5건
- 댓글: 사용자당 분당 20건
- 관리자는 운영상 빠른 답변이 필요할 수 있으므로 댓글 rate limit을 적용하되 충분히 넉넉하게 둔다.

## 8. 테스트 전략

### 8.1 단위 테스트

- `tests/unit/support-types.test.ts`
  - 상태 라벨, 유형 라벨, 상태 전이 그래프
- `tests/unit/support-schemas.test.ts`
  - 제목/내용/참고번호/댓글 길이 검증
- `tests/unit/support-permissions.test.ts`
  - 잠금 상태, 댓글 수정 10분 경계, 상태 전이 가능 여부
- `tests/unit/support-upload-paths.test.ts`
  - 파일명 sanitize, Storage path 생성, cleanup path 계산
- `tests/unit/support-action-errors.test.ts`
  - RPC 에러 메시지 -> 사용자 메시지 매핑

### 8.2 서버/DB 회귀 체크

- 마이그레이션 SQL에 RLS 정책과 RPC가 포함되어 있는지 확인
- `support_requests` RLS: 작성자는 본인 row만, 관리자는 전체 row
- `support_request_comments` RLS: 요청 접근 권한이 있어야 댓글 조회 가능
- `support_request_attachments` RLS: 요청 접근 권한이 있어야 첨부 metadata 조회 가능
- Storage 정책: 첫 path segment의 user id와 auth.uid 일치 또는 admin

### 8.3 수동 QA 체크리스트

1. group1 사용자로 새 CS 문의 작성
2. group2 사용자로 새 CS 문의 작성
3. 첨부 없이 작성 성공
4. 이미지/PDF 첨부 후 상세에서 signed URL 다운로드/미리보기
5. 다른 사용자 문의 URL 직접 접근 시 404
6. 관리자 목록에서 문의 확인, 유형/상태 필터 동작
7. 관리자 댓글 작성 후 사용자 메뉴 unread 배지 증가
8. 사용자 상세 진입 후 unread 배지 감소
9. 사용자 댓글 작성 후 관리자 메뉴 unread 배지 증가
10. 관리자 `처리중` -> `완료` 전환 후 댓글 입력 잠금
11. open 상태에서 사용자 취소 가능
12. 취소/완료 상태에서 댓글 RPC 직접 호출 시 실패

### 8.4 검증 명령

- `pnpm test -- support`
- `pnpm typecheck`
- `pnpm lint`
- 필요 시 Playwright authenticated smoke에 `/support-requests`와 `/admin/support-requests` 추가

## 9. 비범위

이번 구현에는 다음을 포함하지 않는다.

- 주문/배송 데이터와 자동 연결
- 교환/반품 승인 시 예치금 자동 환불
- 재고 자동 증감
- 이메일, SMS, 푸시 알림
- 관리자 내부 메모
- 다중 관리자별 개별 읽음 상태
- 문의 재오픈
- 사용자 글 수정 화면
- 첨부 5개 초과, 동영상 첨부

## 10. 향후 확장 가능성

- 주문번호를 실제 `orders` row와 연결하려면 `support_requests.order_id` nullable FK를 추가할 수 있다.
- 관리자 내부 협업이 필요해지면 `support_request_internal_notes`를 별도 테이블로 추가한다.
- 다중 관리자별 읽음 추적이 필요해지면 `support_request_reads(request_id, admin_id, last_read_at)`로 확장한다.
- 환불/교환 처리 자동화가 필요해지면 현재 게시판을 접수 채널로 두고 별도 운영 RPC를 붙인다.
