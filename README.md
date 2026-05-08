# 엑시트몰

예치금 기반 B2B 폐쇄몰. 승인된 구매자가 예치금으로 엑시트몰 상품을 구매(보유 재고 적립)하고, 별도로 받는사람 명단을 올려 배송대행 발송을 요청합니다. 운영자는 가입 승인, 입금 확인, 상품 관리, 두 흐름의 검토·승인을 담당합니다.

Next.js 14 + Supabase 기반입니다.

최종 업데이트: 2026-05-08

## 두 흐름 개요

- **흐름 1 — 엑시트몰 상품 구매(재고 적립)**: 고객이 결제하면 `stock_orders.pending` 으로 들어가고, 관리자 승인 시 보유 재고에 적립 + 예치금 차감. 이 단계에서는 발송이 일어나지 않습니다.
- **흐름 2 — 배송대행 업로드(재고 발송)**: 고객이 CJ식 1행 1택배 양식 엑셀로 받는사람 명단을 올리면 `order_uploads.pending` 으로 들어가고, 관리자 승인 시 보유 재고에서 차감 + 행수 × ₩3,300 배송비 차감. 관리자가 송장 채운 엑셀을 재업로드하면 행별 송장이 노출됩니다.

## 현재 구현 상태

### 주문자
- 승인된 회원만 상점/주문/예치금 화면 접근
- 상품 목록(재고 ≤ 9 시 "품절 임박" 배지, 수량은 비표시), 장바구니, 검토 요청 (배송정보 입력 없음)
- 상품별 1인 누적 구매 한도 검사 — 승인 + 검토대기 합산
- 예치금 잔액 (가용/검토대기 예약 분리), 이체 요청, 이체 요청 내역
- 내 주문 내역(엑시트몰 상품 검토대기·승인·반려/취소, Legacy 일반 주문 분리)
- 보유 재고 화면 (`/inventory`) — 상품별 가용/예약/총보유 + 변동 내역 timeline
- 배송대행 업로드 (`/shipping-uploads`) — 양식 다운로드, 엑셀 업로드, 행별 미리보기, 검토 요청, 행별 송장 + CJ 조회 + 송장 포함 엑셀 다운로드
- 비밀번호 변경, 아이디 찾기, 비밀번호 재설정

### 관리자
- 가입 승인/거절
- 입금 요청 확인/반려 및 예치금 반영
- 상품 CRUD, 1인 구매 한도 설정, 상품 이미지 Storage 업로드
- 주문관리(`/admin/orders`) — `stock_orders` 검토 목록·상세·승인/반려
- 배송대행 업로드(`/admin/shipping-uploads`) — 검토 목록·상세·승인/반려·원본 다운로드·송장 재업로드·완료 처리
- 송장 채운 엑셀 재업로드 시 행별 `tracking_number` 갱신 + status=shipped (멱등)
- 사용자 관리(잔액 조정·상태·임계치 + 보유 재고 표시·수동 조정)
- Legacy 주문 화면(`/admin/orders-legacy`) — 구 일반 주문 열람 전용 (URL 직접 접근)
- Realtime: 새 `stock_orders` / `order_uploads` 검토대기 토스트 알림
- 비밀번호 변경

### 아직 구현 범위가 아닌 것
- CJ 자동 폴링/캐싱
- 비CJ 택배사의 앱 내 배송 상태 조회
- 사진/OCR 기반 상품 자동 등록
- 가격 비공개 + 문의 유도 UI
- 담당자 자동 매칭

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

현재 마이그레이션에는 기본 폐쇄몰 기능, 1인 구매 한도, 보안 보강에 더해, 배송대행 흐름 재구성을 위한 `stock_orders` / `user_inventory` / `inventory_movements` 테이블, `order_uploads` 확장 컬럼, 흐름 1·2 RPC 8종이 포함되어 있습니다.

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
pnpm test                 # 단위 테스트 (money, Zod schemas, parser, CJ 배송조회, stock-order, shipping-upload, inventory)
pnpm test:e2e             # Playwright (추후 추가 예정)
```

최근 확인: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` 통과.

## 배포 (프로덕션)

1. Supabase 클라우드 프로젝트 생성 → 프로젝트 URL/키 확인.
2. `supabase link --project-ref <ref>` → `supabase db push`로 마이그레이션 적용.
3. Vercel에 연결 → 환경 변수 3개 설정 → 배포.
4. Supabase Auth Redirect URLs에 배포 도메인의 `/auth/callback` 추가.
5. Supabase 대시보드에서 Point-in-Time Recovery(PITR) 활성화(유료).
6. 프로덕션 환경에서 관리자 부트스트랩 (위 SQL).

## 주요 경로

### 주문자
- `/shop` 상품 목록 / `/cart` 장바구니 / `/checkout` 검토 요청 (배송정보 입력 없음)
- `/orders` 내 주문 내역 (엑시트몰 상품 검토대기/승인/반려·취소 + Legacy 일반 주문)
- `/inventory` 보유 재고 / `/inventory/[productId]` 상품별 변동 내역
- `/shipping-uploads` 배송대행 업로드 / `/shipping-uploads/[id]` 행별 미리보기·송장·다운로드
- `/deposit` 예치금 (가용/검토대기 예약 분리) / `/deposit/new` 이체 요청
- `/account/password` 비밀번호 변경
- `/find-account`, `/reset-password` 아이디 찾기·비밀번호 재설정
- `/orders/upload` → `/shipping-uploads` 로 redirect (legacy)

### 관리자 (`/admin/*`, role=admin 전용)
- `/admin` 대시보드 (Realtime 새 검토대기 토스트)
- `/admin/approvals` 가입 승인
- `/admin/deposits` 입금 확인
- `/admin/orders` 주문관리 (stock_orders 탭·상세·승인/반려)
- `/admin/shipping-uploads` 배송대행 업로드 (탭·상세·승인/반려·원본/송장 다운로드·재업로드·완료 처리)
- `/admin/products` 상품 CRUD
- `/admin/users` 사용자 관리 (잔액·상태·임계치 + 보유 재고 + 수동 조정)
- `/admin/low-balance` 잔액 부족 고객
- `/admin/settings` 입금 계좌 정보
- `/admin/orders-legacy` (열람 전용) 구 일반 주문 — URL 직접 접근
- `/admin/order-uploads` → `/admin/shipping-uploads` 로 redirect (legacy)

## 주요 업무 흐름

### 흐름 1: 엑시트몰 상품 구매 (재고 적립)
1. 주문자가 `/shop`에서 상품을 장바구니에 담습니다.
2. `/checkout`에서 "검토 요청" 버튼 → `stock_orders.pending` 생성. 가용 예치금에서 예약만 됩니다(차감 X).
3. 관리자가 `/admin/orders`에서 검토 → 승인 시 예치금 차감 + 마스터 재고 차감 + `user_inventory` 적립 + `inventory_movements` 기록.
4. 반려 시 차감 없이 `rejected` 처리, 사유가 주문자 화면에 노출.
5. 주문자는 검토대기 상태에서 직접 취소 가능.

### 흐름 2: 배송대행 업로드 (재고 발송)
1. 주문자가 `/shipping-uploads`에서 양식 엑셀을 다운로드 → 받는사람 명단 작성 → 업로드.
2. 미리보기에서 행별 검증·관리코드 매칭 확인 → "검토 요청" → `order_uploads.pending` 생성. 보유 재고와 배송비 모두 예약만 됩니다.
3. 관리자가 `/admin/shipping-uploads`에서 검토 → 승인 시 보유 재고 차감(상품별 합산) + 배송비 차감 + `inventory_movements` 음수 기록.
4. 관리자가 송장 채운 엑셀을 같은 업로드에 재업로드 → `attach_tracking` RPC가 행별 `tracking_number` 갱신 + `status=shipped`. 부분 발송도 가능, 멱등 호출 가능.
5. 주문자 화면에 행별 송장 + CJ 조회 버튼 + 송장 포함 엑셀 다운로드 노출.
6. 관리자가 완료 처리 → `status=completed`.

### 예치금 충전
1. 주문자가 `/deposit/new`에서 이체 금액과 입금자명을 제출합니다.
2. 관리자가 `/admin/deposits`에서 실제 입금을 확인합니다.
3. 확인 시 고객 예치금에 금액이 반영됩니다.

## 기술 스택

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Next.js Route Handlers + Server Actions
- **DB/Auth**: Supabase (Postgres + Auth + Realtime + Storage)
- **배송조회**: CJ대한통운 공식 조회 endpoint 연동, 비CJ 외부 조회 URL
- **엑셀 처리**: xlsx
- **검증**: Zod
- **테스트**: Vitest (단위), Playwright (E2E 예정)

## 설계 문서

- 신규 흐름 설계: `docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md`
- 신규 흐름 구현 계획: `docs/superpowers/plans/2026-05-08-shipping-flow-phase{1..5}-*.md`
- 초기 폐쇄몰 설계: `docs/superpowers/specs/2026-04-22-closed-mall-design.md`
- 초기 폐쇄몰 구현 계획: `docs/superpowers/plans/2026-04-22-closed-mall.md`, `-part2.md`

## Windows 주의사항

- `pnpm supabase start` 실패 시 `supabase/config.toml`에서 `[analytics] enabled = false` 설정 (Vector 컨테이너 Docker 소켓 연결 이슈).
- `supabase` CLI 심링크 실패 시 `./node_modules/supabase/bin/supabase.exe` 직접 호출.
