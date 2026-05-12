# 입고리스트(Inbound Requests) 메뉴 — 디자인 스펙

- 작성일: 2026-05-12
- 브랜치: `feature/입고리스트메뉴생성`
- 산출물 종류: 디자인 스펙 (구현 전 합의)

## 1. 배경 & 목적

엑시트몰 사용자가 자신의 입고(사입 입고) 건을 운영팀에 알리고, 운영팀이 진행 상황을 댓글로 회신해 양방향 소통할 수 있는 비공개 게시판 메뉴를 추가한다. 기존 `배송대행 업로드`처럼 엑셀 양식 다운로드를 제공하되, 자동 워크플로(파싱·재고 자동 반영)는 의도적으로 채택하지 않는다. 실제 재고 반영은 운영팀이 별도 수단(관리자 측 재고 조정 RPC 등)으로 처리한다.

### 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 처리 성격 | 게시판/티켓 소통형 (재고 자동 반영 X) |
| 작성 필드 | 제목 + 본문 + 엑셀 1개(필수) + 이미지 0–3장(선택) |
| 상태 | `open(접수)` → `in_progress(진행중)` → `completed(완료)` + `cancelled(취소)` |
| 댓글 권한 | 양방향(작성자/관리자), `completed`/`cancelled` 시 잠금 |
| 수정·삭제 | 작성자: `open` 단계 한정 / 본인 댓글 10분 이내 / 관리자 무제한 |
| 알림 | 메뉴 배지(읽지 않음 카운터), 토스트 X |
| 첨부 제약 | xlsx 1개 ≤5MB, 이미지 ≤3장 각 ≤5MB |
| 공개 범위 | 비공개 — 작성자 본인 + 관리자만 |

## 2. 아키텍처 & 라우팅

### 사용자 라우트 (`app/(user)/inbound-requests/`)
- `page.tsx` — 본인 입고요청 목록 + 신규 작성 진입
- `new/page.tsx` — 작성 폼
- `[id]/page.tsx` — 상세 + 댓글 스레드

### 관리자 라우트 (`app/(admin)/admin/inbound-requests/`)
- `page.tsx` — 전체 입고요청 목록 (상태 탭, 사용자 검색)
- `[id]/page.tsx` — 상세 + 상태 변경 + 댓글

### 네비게이션 등록
- **사용자 nav** (`components/NavUser.tsx`): `사입재고 배송대행` 다음, `예치금` 앞에 **`입고리스트`** (icon: `Inbox`) 추가
- **관리자 사이드바** (`components/AdminSidebar.tsx`): `사입재고 배송대행` 바로 다음에 **`입고리스트`** (icon: `Inbox`) 추가

### 양식 다운로드
- 프로젝트 루트의 `입고리스트 양식.xlsx` 파일을 `public/inbound-template.xlsx` 로 복사
- 사용자 목록 페이지 상단에 다운로드 카드 (기존 `shipping-uploads/exitmall/page.tsx` 의 `FileSpreadsheet + 양식 받기` 패턴 그대로 재사용)

### 책임 분리

| 레이어 | 위치 | 역할 |
|---|---|---|
| DB | `supabase/migrations/` | 테이블·RLS·RPC만 |
| 서버 액션 | `lib/actions/inbound-request.ts` | 작성/수정/삭제/상태전이/댓글 CRUD, Zod 검증 |
| 쿼리 | `lib/inbound/queries.ts` | 목록·상세 조회 (server-only) |
| 타입 | `lib/inbound/types.ts` | 상태 enum, 라벨 맵, 권한 헬퍼 |
| UI | `app/(user|admin)/inbound-requests/**`, `components/inbound/**` | Server Component 우선 |

## 3. 데이터 모델

### 3.1 테이블: `inbound_requests`

```sql
create table public.inbound_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 5000),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  -- 첨부 (필수 엑셀 1 + 선택 이미지 최대 3)
  excel_storage_path text not null,
  excel_original_name text not null,
  image_paths text[] not null default '{}'::text[]
    check (cardinality(image_paths) <= 3),
  -- 알림/배지용
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  -- 읽음 마커
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inbound_requests_user_idx on public.inbound_requests (user_id, created_at desc);
create index inbound_requests_status_idx on public.inbound_requests (status, created_at desc);
```

### 3.2 테이블: `inbound_request_comments`

```sql
create table public.inbound_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inbound_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz  -- soft delete
);
create index inbound_comments_request_idx on public.inbound_request_comments (request_id, created_at);
```

### 3.3 Storage 버킷

```sql
insert into storage.buckets (id, name, public) values
  ('inbound-requests', 'inbound-requests', false)
  on conflict (id) do nothing;
```

- 경로 규칙
  - 엑셀: `{user_id}/{request_id}/excel/{filename}.xlsx`
  - 이미지: `{user_id}/{request_id}/images/{nanoid}.{ext}`
- 폴더 첫 segment = `user_id` → 기존 `order-uploads` RLS 패턴 재사용

### 3.4 읽지 않음 카운터 계산식

- **작성자 입장 unread**: `last_comment_at > coalesce(user_last_read_at, 'epoch') AND last_comment_by_role = 'admin'`
- **관리자 입장 unread**: `last_comment_at > coalesce(admin_last_read_at, 'epoch') AND last_comment_by_role = 'user'`
- 상세 페이지 진입 시 `mark_inbound_read` RPC 호출로 해당 컬럼을 `now()` 로 갱신

### 3.5 Realtime
- `inbound_requests`, `inbound_request_comments` 두 테이블을 `supabase_realtime` publication 에 추가

## 4. RLS & RPC

### 4.1 RLS: `inbound_requests`

```sql
alter table public.inbound_requests enable row level security;

create policy inbound_requests_owner_admin_select on public.inbound_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (user_id = auth.uid() and public.is_active());

create policy inbound_requests_self_update on public.inbound_requests
  for update using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid() and status = 'open');

create policy inbound_requests_self_delete on public.inbound_requests
  for delete using (user_id = auth.uid() and status = 'open');

create policy inbound_requests_admin_all on public.inbound_requests
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.2 RLS: `inbound_request_comments`

```sql
alter table public.inbound_request_comments enable row level security;

create policy inbound_comments_select on public.inbound_request_comments
  for select using (
    exists (
      select 1 from public.inbound_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy inbound_comments_insert on public.inbound_request_comments
  for insert with check (
    public.is_active()
    and author_id = auth.uid()
    and (
      (author_role = 'user' and exists (
        select 1 from public.inbound_requests r
        where r.id = request_id and r.user_id = auth.uid()
          and r.status in ('open','in_progress')
      ))
      or (author_role = 'admin' and public.is_admin() and exists (
        select 1 from public.inbound_requests r
        where r.id = request_id and r.status in ('open','in_progress')
      ))
    )
  );

create policy inbound_comments_self_update on public.inbound_request_comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete using (author_id = auth.uid());

create policy inbound_comments_admin_all on public.inbound_request_comments
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.3 Storage 정책 (`storage.objects`, bucket `inbound-requests`)

```sql
-- 소유자(폴더 첫 segment = user_id) 또는 admin 만 읽기
create policy "inbound-requests owner read" on storage.objects
  for select using (
    bucket_id = 'inbound-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

-- 소유자 본인 + active 인 경우 업로드
create policy "inbound-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

-- 소유자가 본인 파일 update/delete (rename용)
create policy "inbound-requests owner update" on storage.objects
  for update using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "inbound-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 관리자 전권
create policy "inbound-requests admin all" on storage.objects
  for all using (bucket_id = 'inbound-requests' and public.is_admin())
  with check (bucket_id = 'inbound-requests' and public.is_admin());
```

### 4.4 RPC

| RPC | 호출자 | 역할 |
|---|---|---|
| `set_inbound_status(request_id uuid, new_status text)` | admin | 상태 전이. `for update` 행 잠금, 그래프 검증, `reviewed_by` 기록 |
| `cancel_inbound_request(request_id uuid)` | 작성자(open 한정) 또는 admin | open → cancelled |
| `mark_inbound_read(request_id uuid)` | 작성자 또는 admin | 호출자 역할에 따라 `user_last_read_at` 또는 `admin_last_read_at` 갱신 |
| `add_inbound_comment(request_id uuid, body text)` | 작성자 또는 admin | author_role 결정 + 부모 행 `last_comment_at` 동기화 |

> 글 삭제는 별도 RPC 없이 RLS `inbound_requests_self_delete`(작성자·open 한정) 또는 admin 정책을 통해 직접 `delete` 한다. Storage 객체 정리는 서버 액션이 후속 호출로 수행한다.

### 4.5 상태 전이 그래프

```
   ┌─────────┐  admin       ┌──────────────┐  admin     ┌────────────┐
   │  open   │ ────────────▶│ in_progress  │ ──────────▶│ completed  │
   └────┬────┘              └──────┬───────┘            └────────────┘
        │ author 또는 admin        │
        │                          │ admin 만
        ▼                          ▼
   ┌──────────────────────────────────┐
   │           cancelled              │
   └──────────────────────────────────┘
```

- `completed` / `cancelled` 는 종결 상태. 재오픈 불가 — 추가 작업은 새 글로 분리
- 잘못된 전이는 RPC 가 `INVALID_TRANSITION` 에러 반환

## 5. UI 표면

### 5.1 사용자: `/inbound-requests` (목록)
- 헤더 + 양식 다운로드 카드 (`shipping-uploads/exitmall/page.tsx` 와 동일 톤)
- "+ 새 입고요청 작성" CTA → `/inbound-requests/new`
- 목록: 행마다 상태 배지, 제목, 작성일, 댓글 수, 새 답변 N 미니 배지
- 빈 상태: `Inbox` 아이콘 + 안내 + CTA

### 5.2 사용자: `/inbound-requests/new` (작성)
- 단일 카드 폼 (`useFormState` + `useFormStatus`)
- 필드: 제목(필수), 본문(textarea, 선택), 엑셀(필수 .xlsx ≤5MB), 이미지(0–3장, 각 ≤5MB)
- 클라이언트 검증 → Storage 업로드 → 서버 액션
- 성공 시 `/inbound-requests/[id]` 리다이렉트

### 5.3 사용자: `/inbound-requests/[id]` (상세)
- 헤더: 뒤로/상태 배지/제목/작성일 + 작성자 액션(취소·수정, `open` 한정)
- 본문 카드: 본문 + 엑셀 다운로드 버튼 + 이미지 라이트박스
- 댓글 스레드 (시간 오름차순): 역할 아이콘 / 작성자 / 시각 / 본문 / 본인 댓글 10분 이내면 수정·삭제 버튼
- 댓글 입력 영역: 상태가 `open`/`in_progress` 일 때만 활성. 잠금 시 안내 문구
- 페이지 진입 시 `mark_inbound_read` 호출

### 5.4 관리자: `/admin/inbound-requests` (목록)
- 상단 탭: `전체` / `접수` / `진행중` / `완료` / `취소`
- 테이블 컬럼: 작성자, 제목, 상태, 댓글 수, 마지막 활동, 작성일
- 사용자 검색 input (이름·이메일 partial match)

### 5.5 관리자: `/admin/inbound-requests/[id]` (상세)
- 사용자 상세와 유사 + 우상단 상태 변경 액션
  - `open` → `[진행중으로 이동]` / `[취소]`
  - `in_progress` → `[완료 처리]` / `[취소]`
  - 종결 상태 → 액션 없음 (회색 안내)
- 댓글 작성 시 `author_role='admin'` 자동
- 진입 시 `mark_inbound_read` 호출 (admin 컬럼 갱신)

### 5.6 공통 컴포넌트
- `components/inbound/InboundStatusBadge.tsx`
- `components/inbound/InboundCommentList.tsx` (Server)
- `components/inbound/InboundCommentForm.tsx` (Client)
- `components/inbound/InboundAttachmentList.tsx` (서명 URL 렌더)
- `components/inbound/InboundUnreadBadge.tsx` (NavUser/AdminSidebar 삽입; Realtime)

### 5.7 MASTER.md 토큰 준수
- 상태 배지 4색(`success`/`warning`/`danger`/`info`) 시스템 재사용 (success=완료, warning=진행중, danger=취소, info=접수)
- 카드 `border-only`, hover 시 미세 그림자, `rounded-lg`
- 모달은 단일 단계 — 취소/수정은 `ConfirmDialog`
- 본문 텍스트: `whitespace-pre-wrap` plain text (Markdown 미지원)

## 6. 데이터 플로우

### 6.1 신규 입고요청 작성
```
[Client: /inbound-requests/new]
  ├─ Zod 클라 검증
  ├─ supabase.storage.upload(
  │    bucket='inbound-requests',
  │    path=`${user.id}/_pending_${nanoid}/excel/${file.name}`)
  ├─ 이미지 0–3장 동일 규칙 업로드
  └─ submitInboundRequestAction(FormData)
        ├─ Zod 재검증
        ├─ insert into inbound_requests (RLS self_insert 통과)
        ├─ Storage 의 `_pending_${nanoid}` segment 를 신규 request_id 로 rename
        ├─ revalidatePath('/inbound-requests')
        └─ redirect('/inbound-requests/[id]')
```
- rename 실패 시 행은 살아 있고 경로는 `_pending_*` 로 남는다. 동작에는 지장 없음.

### 6.2 관리자 상태 전이
```
[Admin] [진행중으로 이동] → ConfirmDialog
  └─ setInboundStatusAction(requestId, 'in_progress')
        ├─ supabase.rpc('set_inbound_status', { ... })
        ├─ revalidatePath('/admin/inbound-requests/[id]')
        └─ revalidatePath('/inbound-requests/[id]')
```

### 6.3 댓글 작성
```
[InboundCommentForm 제출]
  └─ addInboundCommentAction(requestId, body)
        ├─ Zod: 1–2000자
        ├─ supabase.rpc('add_inbound_comment', { request_id, body })
        │   RPC 내부:
        │     - 부모 조회 (RLS 통과 = 권한 확인)
        │     - status ∈ (open, in_progress) → 아니면 'LOCKED'
        │     - author_role = is_admin() ? 'admin' : 'user'
        │     - insert into comments
        │     - update inbound_requests
        │         set last_comment_at = now(),
        │             last_comment_by_role = author_role,
        │             updated_at = now()
        └─ revalidatePath(상세)
```

### 6.4 읽지 않음 배지 (Realtime)
```
[InboundUnreadBadge]
  ├─ 마운트: count 쿼리 (역할별 unread filter)
  ├─ Realtime 구독:
  │   - inbound_requests (filter: user_id=eq.{me} OR admin인 경우 전체)
  │   - inbound_request_comments
  └─ 변동 감지 시 count 재조회

[상세 진입]
  └─ markInboundReadAction(requestId)
        └─ rpc('mark_inbound_read', ...)
        └─ Realtime 으로 배지 자동 감소
```
- 관리자 unread: `admin_last_read_at` 단일 컬럼 — "관리자 누군가 읽으면 모든 관리자에게 읽음 처리". 현 운영 규모 고려한 단순화.

## 7. 에러 처리 & 엣지 케이스

### 7.1 입력 검증
- Zod 실패 → 폼 inline 에러 (`aria-live="polite"`)
- 클라이언트에서 차단해도 서버에서 항상 재검증

### 7.2 Storage 부분 업로드 실패
- 이미 올라간 `_pending_*` 파일은 orphan 으로 남음
- 정리 함수 `cleanup_orphan_inbound_pending(older_than interval)` 만 SQL 로 정의 (스케줄 호출은 본 범위 밖)

### 7.3 동시성
- `set_inbound_status` RPC 내부 `select ... for update` 행 잠금
- 잘못된 전이 → `INVALID_TRANSITION` → 관리자 측 destructive 토스트
- 작성자가 본인 글 수정 중 관리자가 진행중으로 전이 → RLS 조건 불만족 → UPDATE 0 행 → 서버 액션이 `STATE_CHANGED` 반환, 새로고침 안내
- 잠긴 글에 댓글 시도 → RPC `LOCKED` → 입력 영역 자리에 잠금 안내. 입력값은 보존하고 안내

### 7.4 댓글 10분 룰
- DB RLS: 본인 댓글이면 update/delete 허용
- 시간 검사는 서버 액션에서 `now() - created_at > interval '10 minutes'` → `EDIT_WINDOW_EXPIRED`
- 클라: `created_at` 기준 10분 카운트다운 후 버튼 자동 숨김 (확정은 서버)

### 7.5 첨부 다운로드
- private bucket → 서버 액션 `getInboundAttachmentUrlAction(requestId, path)` 로 60초 서명 URL 발급
- 서버에서 권한 확인: `request.user_id = auth.uid() OR is_admin()` (RLS 동일 조건)

### 7.6 삭제 흐름
- 작성자 글 삭제(open만): 서버 액션이 `supabase.from('inbound_requests').delete().eq('id', requestId)` 로 직접 삭제 (RLS 가 작성자·open 또는 admin 조건 강제). 댓글은 FK cascade 로 자동 삭제 → 직후 서버 액션이 Storage 객체 일괄 삭제
- Storage 삭제 실패는 무시 (행은 사라짐, orphan 은 cleanup 함수 대상)

### 7.7 이미지 표시
- 서버 컴포넌트에서 60초 서명 URL 받아 `<img>` 렌더 (private bucket)
- 첨부 노출은 항상 서명 URL 만 — 직접 storage 객체 노출 금지

### 7.8 XSS / 컨텐츠 안전
- `title`, `body`, `comment.body` plain text 저장, `whitespace-pre-wrap` 렌더
- Markdown/HTML 미지원

### 7.9 Rate limit
- 신규 글: 사용자당 분당 5건 (RPC 내부 카운트 검사)
- 댓글: 사용자당 분당 20건

### 7.10 권한 우회
- 다른 사용자 글 URL 직접 접근 → RLS 0 행 → `notFound()` (존재 노출 방지)
- 관리자 RPC 직접 호출 시도 → RPC 내부 `is_admin()` → `FORBIDDEN`

## 8. 테스트 전략

### 8.1 단위 테스트 (Vitest)
- `tests/inbound/types.test.ts` — 상태 라벨, `canTransition(from, to)` 그래프
- `tests/inbound/validation.test.ts` — Zod 스키마 (제목/본문/이미지 갯수/댓글 길이/확장자)
- `tests/inbound/permissions.test.ts` — `canEditRequest(status, role, isOwner)`, `canEditComment(createdAt)` 10분 경계

### 8.2 통합 테스트 (기존 패턴 확인 후 채택)
- `tests/inbound/rls.test.ts` — RLS 격리 검증
- `tests/inbound/rpc.test.ts` — RPC 4종(상태전이/취소/댓글/읽음)

### 8.3 수동 회귀 체크리스트
1. 양식 다운로드 → 작성 → 제출 → 목록·상세 진입
2. 관리자 목록에서 신규 노출, `진행중` 으로 전이
3. 양방향 댓글, NavUser/AdminSidebar 배지 증감 확인
4. 본인 댓글 10분 이내 수정, 10분 후 버튼 사라짐
5. `완료` 전이 시 댓글 입력 비활성 + 안내
6. 작성자가 본인 글 `취소`(open 한정) 시 행 + 첨부 정리
7. 다른 사용자 ID 로 URL 직접 접근 → 404
8. 첨부 서명 URL 만료 후 재발급 정상

### 8.4 빌드/타입 검증
- `pnpm typecheck` / `pnpm lint` / `pnpm build` 모두 clean

## 9. 비범위(Out of Scope)

다음은 본 스펙에서 의도적으로 제외한다.
- 엑셀 자동 파싱 / 자동 재고 반영 (`user_inventory`, `inventory_movements` 변동)
- 관리자 내부 메모(작성자가 보지 못하는 admin-only 코멘트)
- 이메일 알림 / 푸시 알림
- Storage orphan 자동 cleanup 스케줄
- 글 재오픈(`completed → in_progress`)
- 첨부 이미지 4장 이상 / 동영상

## 10. 향후 확장 가능성 (참고)

- 자동 파싱 도입 시: 별도 `parsed_items jsonb` 컬럼을 `inbound_requests` 에 추가하고, `approve_inbound_request(id)` RPC 로 `user_inventory` 반영 흐름 추가 가능. 본 디자인은 그 확장과 충돌하지 않는다.
- 다중 관리자 환경에서 admin unread 추적이 부족해지면, 별도 `inbound_request_reads(request_id, admin_id, last_read_at)` 테이블로 마이그레이션 가능.
