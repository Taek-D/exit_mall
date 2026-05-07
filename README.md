# 엑시트몰

예치금 기반 B2B 폐쇄몰. 승인된 구매자가 예치금으로 상품을 주문하고, 운영자는 가입 승인, 입금 확인, 상품/주문/배송/엑셀 주문서를 관리합니다.

Next.js 14 + Supabase 기반입니다.

## 현재 구현 상태

### 주문자
- 승인된 회원만 상점/주문/예치금 화면 접근
- 상품 목록, 장바구니, 체크아웃
- 상품별 1인 누적 구매 한도 표시 및 제한
- 예치금 잔액 확인, 이체 요청, 이체 요청 내역 확인
- 내 주문 내역 확인 및 `placed` 상태 주문 취소
- 송장번호가 입력된 주문의 택배 조회 링크 제공
- 엑셀 주문서 양식 다운로드 및 `.xlsx` 주문서 업로드
- 계정 메뉴에서 현재 비밀번호 확인 후 비밀번호 변경
- 로그인 화면에서 아이디 찾기 및 비밀번호 재설정 메일 요청

### 관리자
- 가입 승인/거절
- 입금 요청 확인/반려 및 예치금 반영
- 상품 CRUD, 상품 이미지 Supabase Storage 업로드
- 상품별 1인 구매 한도 설정
- 주문 목록 상태 탭, 주문 상세, 상태 전이
- 발송 처리 시 택배사/송장번호 입력
- 주문 목록 엑셀 다운로드
- 업로드된 주문서 검토, 원본 다운로드, 승인/반려
- 주문서 승인 시 예치금 차감 및 정식 주문 생성
- 사용자 관리, 잔액 조정, 잔액 부족 고객 확인
- 입금 계좌/공지 설정
- 관리자 계정 메뉴에서 현재 비밀번호 확인 후 비밀번호 변경
- 비밀번호 재설정 링크 콜백 처리 및 새 비밀번호 설정

### 아직 구현 범위가 아닌 것
- 상품 가격 비공개 후 문의 유도 UI
- 상품별 담당 구매자/담당자 자동 매칭
- 택배사 실시간 API 연동
  - 현재는 CJ대한통운, 한진택배, 롯데택배, 로젠택배, 우체국택배, 경동택배 조회 URL로 연결합니다.
- 사진/OCR 기반 상품 자동 등록

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
./node_modules/supabase/bin/supabase.exe db reset
./node_modules/supabase/bin/supabase.exe gen types typescript --local > lib/db-types.ts
```

현재 마이그레이션에는 기본 폐쇄몰 기능, 1인 구매 한도, 엑셀 주문서 업로드/승인, 보안 보강, 주문 승인 시 재고/한도 검증 로직이 포함되어 있습니다.

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
pnpm typecheck            # TypeScript 타입 검사
pnpm test                 # 단위 테스트 (money, Zod schemas, order upload parser) - 40개
pnpm test:e2e             # Playwright (추후 추가 예정)
```

최근 확인: `pnpm typecheck`, `pnpm test` 통과.

## 배포 (프로덕션)

1. Supabase 클라우드 프로젝트 생성 → 프로젝트 URL/키 확인.
2. `supabase link --project-ref <ref>` → `supabase db push`로 마이그레이션 적용.
3. Vercel에 연결 → 환경 변수 3개 설정 → 배포.
4. Supabase Auth Redirect URLs에 배포 도메인의 `/auth/callback` 추가.
5. Supabase 대시보드에서 Point-in-Time Recovery(PITR) 활성화(유료).
6. 프로덕션 환경에서 관리자 부트스트랩 (위 SQL).

## 주요 경로

### 주문자
- `/shop` 상품 목록 / `/cart` 장바구니 / `/checkout` 주문서
- `/deposit` 예치금 잔액·이체 내역 / `/deposit/new` 이체 요청
- `/orders` 내 주문 내역 (placed 상태만 취소 가능, 송장번호가 있으면 배송조회)
- `/orders/upload` 엑셀 주문서 양식 다운로드·업로드
- `/account/password` 비밀번호 변경
- `/find-account` 아이디 찾기·비밀번호 재설정 메일 요청
- `/reset-password` 비밀번호 재설정 링크로 새 비밀번호 설정

### 관리자 (`/admin/*`, role=admin 전용)
- `/admin` 대시보드 (Realtime 새 주문 토스트)
- `/admin/approvals` 가입 승인
- `/admin/deposits` 입금 확인
- `/admin/orders` 주문 관리 (탭 + 상세 + 상태 전이 + 송장 입력 + 엑셀 다운로드)
- `/admin/order-uploads` 엑셀 주문서 검토/승인/반려
- `/admin/products` 상품 CRUD (이미지 Supabase Storage 업로드, 1인 구매 한도)
- `/admin/users` 사용자 관리 (잔액 조정·상태 변경·임계치)
- `/admin/low-balance` 잔액 부족 고객
- `/admin/settings` 입금 계좌 정보
- `/admin/account/password` 관리자 비밀번호 변경

## 주요 업무 흐름

### 일반 상품 주문
1. 주문자가 `/shop`에서 상품을 장바구니에 담습니다.
2. `/checkout`에서 배송 정보를 입력하고 주문합니다.
3. 주문 시 예치금이 차감되고 재고가 감소합니다.
4. 관리자가 `/admin/orders`에서 `접수 -> 준비중 -> 배송중 -> 완료`로 상태를 변경합니다.
5. `배송중` 처리 시 택배사와 송장번호를 입력하면 주문자 주문 내역에서 배송조회 링크가 표시됩니다.

### 예치금 충전
1. 주문자가 `/deposit/new`에서 이체 금액과 입금자명을 제출합니다.
2. 관리자가 `/admin/deposits`에서 실제 입금을 확인합니다.
3. 확인 시 고객 예치금에 금액이 반영됩니다.

### 엑셀 주문서 주문
1. 주문자가 `/orders/upload`에서 엑셀 양식을 다운로드합니다.
2. 작성한 `.xlsx` 파일을 업로드합니다.
3. 관리자가 `/admin/order-uploads`에서 파싱 결과와 원본 파일을 확인합니다.
4. 승인 시 예치금이 차감되고 정식 주문이 생성됩니다.
5. 반려 시 반려 사유가 주문자에게 노출됩니다.

## 기술 스택

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Next.js Route Handlers + Server Actions
- **DB/Auth**: Supabase (Postgres + Auth + Realtime + Storage)
- **엑셀 처리**: xlsx
- **검증**: Zod
- **테스트**: Vitest (단위), Playwright (E2E 예정)

## 설계 문서

- 설계: `docs/superpowers/specs/2026-04-22-closed-mall-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-22-closed-mall.md`, `-part2.md`

## Windows 주의사항

- `pnpm supabase start` 실패 시 `supabase/config.toml`에서 `[analytics] enabled = false` 설정 (Vector 컨테이너 Docker 소켓 연결 이슈).
- `supabase` CLI 심링크 실패 시 `./node_modules/supabase/bin/supabase.exe` 직접 호출.
