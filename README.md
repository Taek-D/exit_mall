# 엑시트몰 (폐쇄몰)

예치금 기반 폐쇄몰. Next.js 14 + Supabase.

## 로컬 개발 환경 셋업

### 필수 도구
- Node.js 20+ / pnpm 10+
- Docker Desktop (Supabase local용)

### 1. 설치

```bash
pnpm install
pnpm supabase start   # Docker 필요. 첫 실행은 이미지 pull 때문에 수분 소요
```

Windows에서 `supabase` 바이너리 심링크가 안 잡히면 `./node_modules/supabase/bin/supabase.exe ...`로 직접 호출하세요.

### 2. 환경 변수

`.env.local.example` → `.env.local` 복사 후 `supabase start` 출력에서 키 복사:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<로컬 anon key>
SUPABASE_SERVICE_ROLE_KEY=<로컬 service_role key>
```

### 3. DB 초기화 + 타입 생성

```bash
./node_modules/supabase/bin/supabase.exe db reset           # 4개 마이그레이션 적용
./node_modules/supabase/bin/supabase.exe gen types typescript --local > lib/db-types.ts
```

### 4. 개발 서버

```bash
pnpm dev   # http://localhost:3000
```

## 초기 관리자 부트스트랩

첫 관리자는 앱 UI로 만들 수 없습니다(승인해줄 관리자가 없음). 수동 생성:

1. `/signup`에서 관리자 계정으로 회원가입 (또는 Supabase Studio Auth 대시보드에서 사용자 생성).
2. Supabase Studio(`http://127.0.0.1:54323`) SQL Editor에서:
   ```sql
   update public.profiles
   set role = 'admin', status = 'active', approved_at = now()
   where email = 'admin@example.com';
   ```
3. `/login` → 관리자로 로그인 → `/admin/settings`에서 계좌 정보 입력.

## 테스트

```bash
pnpm test                 # 단위 테스트 (money, Zod schemas) — 23개
pnpm test:e2e             # Playwright (추후 추가 예정)
```

## 배포 (프로덕션)

1. Supabase 클라우드 프로젝트 생성 → 프로젝트 URL/키 확인.
2. `supabase link --project-ref <ref>` → `supabase db push`로 마이그레이션 적용.
3. Vercel에 연결 → 환경 변수 3개 설정 → 배포.
4. Supabase 대시보드에서 Point-in-Time Recovery(PITR) 활성화(유료).
5. 프로덕션 환경에서 관리자 부트스트랩 (위 SQL).

## 주요 경로

### 주문자
- `/shop` 상품 목록 / `/cart` 장바구니 / `/checkout` 주문서
- `/deposit` 예치금 잔액·이체 내역 / `/deposit/new` 이체 요청
- `/orders` 내 주문 내역 (placed 상태만 취소 가능)

### 관리자 (`/admin/*`, role=admin 전용)
- `/admin` 대시보드 (Realtime 새 주문 토스트)
- `/admin/approvals` 가입 승인
- `/admin/deposits` 입금 확인
- `/admin/orders` 주문 관리 (탭 + 상태 전이 + 송장 입력)
- `/admin/products` 상품 CRUD (이미지 Supabase Storage 업로드)
- `/admin/users` 사용자 관리 (잔액 조정·상태 변경·임계치)
- `/admin/low-balance` 잔액 부족 고객
- `/admin/settings` 입금 계좌 정보

## 기술 스택

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Next.js Route Handlers + Server Actions
- **DB/Auth**: Supabase (Postgres + Auth + Realtime + Storage)
- **검증**: Zod
- **테스트**: Vitest (단위), Playwright (E2E 예정)

## 설계 문서

- 설계: `docs/superpowers/specs/2026-04-22-closed-mall-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-22-closed-mall.md`, `-part2.md`

## Windows 주의사항

- `pnpm supabase start` 실패 시 `supabase/config.toml`에서 `[analytics] enabled = false` 설정 (Vector 컨테이너 Docker 소켓 연결 이슈).
- `supabase` CLI 심링크 실패 시 `./node_modules/supabase/bin/supabase.exe` 직접 호출.
