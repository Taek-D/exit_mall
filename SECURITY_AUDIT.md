# 보안 감사 리포트 — 엑시트몰

**프로젝트:** exitmall (Next.js 14.2.15 + Supabase 폐쇄몰)
**점검일:** 2026-05-07
**점검 범위:** 8개 카테고리 — 환경변수/시크릿, 인증/인가, Rate Limiting, 파일 업로드, 스토리지, Prompt Injection, 정보 노출, 의존성

---

## 요약

| 심각도 | 발견 수 |
|--------|---------|
| CRITICAL | 1 |
| HIGH | 5 |
| MEDIUM | 5 |
| LOW | 4 |
| **총계** | **15** |

가장 시급한 항목은 **Next.js 14.2.15의 미들웨어 인가 우회 CVE-2025-29927**입니다. 본 프로젝트는 `middleware.ts` 한 곳에서 로그인/관리자/계정상태를 모두 게이트하므로, 이 CVE가 곧바로 인증 우회로 직결됩니다. 즉시 `next@14.2.25` 이상으로 패치 권장.

---

## 발견된 취약점

### [CRITICAL-1] Next.js 미들웨어 인가 우회 (CVE-2025-29927)

- **심각도:** CRITICAL
- **카테고리:** 인증/인가 + 의존성
- **위치:** `package.json:31` (`"next": "14.2.15"`), 영향 면 `middleware.ts`
- **설명:** Next.js < 14.2.25 에는 `x-middleware-subrequest` 헤더 신뢰로 인해 외부 요청이 미들웨어를 건너뛸 수 있는 결함이 있습니다. 본 앱의 권한 체크는 전부 `middleware.ts`에서 수행됩니다(로그인 강제, 관리자 라우트 차단, 비활성 계정 차단, `/`→역할별 redirect). 이 CVE가 트리거되면 비로그인/일반 유저가 `/admin/*`, `/admin/orders/export`, `/admin/users/*`, `/admin/settings` 등 모든 보호 라우트에 접근 가능합니다.
- **영향:**
  - 비로그인 상태로 관리자 페이지 직접 접근 → 거의 모든 페이지가 server component에서 `createClient()`로 다시 인증/role 체크를 수행하므로 직접 데이터 노출은 제한적이지만,
  - `app/(admin)/admin/orders/export/route.ts`, `app/(admin)/admin/layout.tsx`처럼 라우트 레벨에서 다시 검증되는 곳은 안전. 그러나 `app/(user)/orders/upload`, `app/(user)/checkout` 등은 layout 레벨 검증(`UserLayout`)에 의존하므로 검증 누락 시 익명 접근 가능.
  - 또한 미들웨어에서 처리하는 "비활성 계정 → /pending 강제" 로직이 우회되어, 정지/대기 상태 유저가 정상 유저 페이지에 접근 가능.
- **수정 방법:**
  ```bash
  pnpm up next@14.2.25
  # 또는 LTS 라인 최신: pnpm up next@latest (메이저 변경 검토 필요)
  ```
  업그레이드 후 `pnpm audit` 재실행해 다른 Next 관련 high 항목(DoS 4건, race-condition cache poisoning, dev-server origin verification)도 함께 닫습니다.

---

### [HIGH-1] 의존성 — xlsx (SheetJS) 0.18.5 Prototype Pollution + ReDoS

- **심각도:** HIGH
- **카테고리:** 의존성 + 파일 업로드 보안
- **위치:** `package.json:37`, 사용처 `lib/order-upload-parser.ts:1`, `app/(admin)/admin/orders/export/route.ts:3`
- **설명:** SheetJS `xlsx@0.18.5`에 두 건의 high CVE가 있습니다(prototype pollution, ReDoS). 사용자 업로드 파일을 직접 파싱하는 `parseOrderExcel()`(server action `uploadOrderExcelAction`에서 호출)이 공격면입니다. 매직바이트(PKZip) 검사는 있지만 PKZip 컨테이너 내부에 악성 구조를 넣어 우회 가능.
- **영향:** 활성 유저가 조작된 .xlsx 업로드 시 server action 컨텍스트에서 prototype pollution → 권한 상승/세션 오염, 또는 ReDoS로 server action 워커 점유.
- **수정 방법:**
  - SheetJS 공식 패치는 npm 레지스트리에 없고 CDN(`https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz`)으로 이전됨. 옵션 A: SheetJS CDN 버전 핀.
  - 옵션 B(권장): `exceljs`로 마이그레이션. xlsx 사용처가 2곳뿐이고 단순 read/write만 사용 중이라 비용 낮음.
  ```ts
  // lib/order-upload-parser.ts (현재)
  import * as XLSX from 'xlsx';
  // ↓
  import ExcelJS from 'exceljs';
  ```

---

### [HIGH-2] Rate Limiting 전무

- **심각도:** HIGH
- **카테고리:** Rate Limiting
- **위치:** 전체 server actions / API routes — `pnpm-lock.yaml`을 제외한 소스 코드에 ratelimit 의존성/구현 없음
- **설명:** 다음 엔드포인트가 무제한입니다:
  1. `loginAction` (`lib/actions/auth.ts:36`) — 비밀번호 brute-force.
  2. `findAccountAction` (`lib/actions/auth.ts:122`) — service_role로 (이름, 전화번호) 조회. 응답이 차등(매치 vs 0건 + status)이라 사용자 열거(enumeration) 가능.
  3. `requestPasswordResetAction` (`lib/actions/auth.ts:158`) — 이메일 폭탄 가능.
  4. `signupAction` (`lib/actions/auth.ts:15`) — Supabase auth.signUp 무제한 호출.
  5. `GET /api/orders/[id]/tracking` (`app/api/orders/[id]/tracking/route.ts:22`) — CJ대한통운 외부 호출. 활성 유저 1명이 외부 트래픽 증폭/CJ 차단/비용 발생 유도 가능.
- **영향:** 계정 탈취(brute-force), 사용자 열거, 메일 폭격, SSRF형 amplification.
- **수정 방법:**
  - Upstash `@upstash/ratelimit` + `@vercel/kv` 또는 Supabase RPC + 테이블 기반 토큰 버킷 도입.
  - 최소한 `loginAction` / `findAccountAction` / `requestPasswordResetAction` 에 IP+이메일 단위 5req/분 적용.
  - `tracking` 라우트는 (user_id, order_id) 단위 1회/30초 캐시 + 1분당 30회 등.
  - 로그인 차단은 미들웨어 또는 server action 진입부에 다음과 같이:
  ```ts
  // lib/rate-limit.ts (new)
  import { Ratelimit } from '@upstash/ratelimit';
  import { Redis } from '@upstash/redis';
  export const loginLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '1 m'),
  });
  ```

---

### [HIGH-3] 보안 헤더 미설정

- **심각도:** HIGH
- **카테고리:** 정보 노출
- **위치:** `next.config.mjs:1-11` — `headers()` 콜백 부재
- **설명:** `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` 어느 것도 설정돼 있지 않습니다. 코드 내 `dangerouslySetInnerHTML`은 없어 즉시 XSS는 없지만, Supabase 인증 토큰을 다루는 SaaS에서 CSP/HSTS는 기본입니다.
- **영향:** clickjacking(관리자 동의 갈취), MIME sniffing 기반 우회, 만료 인증서/HTTP 다운그레이드, third-party 스크립트 사고 시 토큰 유출.
- **수정 방법:**
  ```js
  // next.config.mjs
  const securityHeaders = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
      key: 'Content-Security-Policy',
      value:
        "default-src 'self'; img-src 'self' https://*.supabase.co data: blob:; " +
        "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' https://*.supabase.co; frame-ancestors 'none';",
    },
  ];
  const nextConfig = {
    images: { /* ... */ },
    async headers() {
      return [{ source: '/:path*', headers: securityHeaders }];
    },
  };
  ```

---

### [HIGH-4] node-tar / glob 등 dev 의존성 high CVE

- **심각도:** HIGH (dev 한정이지만 빌드/CI 사용)
- **카테고리:** 의존성
- **위치:** `pnpm-lock.yaml` 내 `supabase` CLI / `shadcn` CLI 트랜지티브
- **설명:** `pnpm audit` 결과 node-tar 5건, glob CLI 1건의 high CVE (path traversal, hardlink escape, command injection via `-c/--cmd`).
- **영향:** 악성 supabase CLI 패키지가 마이그레이션 dump를 통해 임의 파일 쓰기/명령 실행. 실제 익스플로잇은 supabase 또는 shadcn이 악성으로 변하거나 악성 tarball을 받았을 때 발동.
- **수정 방법:**
  ```bash
  pnpm up supabase shadcn
  pnpm up @modelcontextprotocol/sdk
  pnpm dedupe
  ```

---

### [HIGH-5] Find-account: service_role + 사용자 열거

- **심각도:** HIGH
- **카테고리:** 인증/인가 + 정보 노출
- **위치:** `lib/actions/auth.ts:122-156`
- **설명:** 비로그인 상태로 호출 가능한 `findAccountAction`은 service_role 클라이언트로 `profiles`를 조회합니다. 응답은 `accounts: []` vs `accounts: [{ email, status }]`로 차등이 명확하므로 이름+전화번호 조합을 가지고 있는 공격자가 회원여부+상태(`pending`/`active`/`suspended`)를 확정 가능.
  ```ts
  // lib/actions/auth.ts:135-155
  const supabase = createServiceRoleClient();      // RLS 우회
  const { data } = await supabase.from('profiles')
    .select('email,phone,status').eq('name', parsed.data.name);
  // ...
  return { ok: true, accounts: matched.map(...) };  // 0건/n건 차등
  ```
  HIGH-2의 무제한 호출과 결합되면 한국 흔한 이름 + 전화번호 prefix만으로 가입자 명단 수집 가능.
- **영향:** PII 단계적 추출, 표적 피싱, 정지 계정 우회 시도.
- **수정 방법:**
  - 응답을 항상 동일하게 — "입력하신 정보로 등록된 계정이 있다면 해당 이메일로 안내를 발송했습니다" 패턴(이메일/문자 발송으로만 결과 전달).
  - 또는 응답 차등을 유지하더라도 IP+name 기반 5req/시간 rate limit + reCAPTCHA.
  - service_role을 굳이 쓰지 않고 SECURITY DEFINER RPC `lookup_account(name, phone)`로 옮겨 권한 최소화.

---

### [MEDIUM-1] 관리자 server actions가 RLS 단일 의존

- **심각도:** MEDIUM
- **카테고리:** 인증/인가
- **위치:**
  - `lib/actions/admin-approvals.ts:5,16` — `update profiles ... where id=userId` 직접 호출
  - `lib/actions/admin-products.ts:24,39,52` — products CRUD
  - `lib/actions/admin-settings.ts:17` — app_settings update
  - `lib/actions/admin-users.ts:25,35` — profiles update
- **설명:** 위 server actions는 server-side에서 `is_admin` 체크 없이 곧바로 user-scoped Supabase 클라이언트로 SQL을 던지고 RLS 정책(`profiles_admin_all`, `products_admin_all`, `app_settings_admin_write`)에만 의존합니다. RLS가 일관되게 잘 깔려 있지만(미그레이션 검토 결과 양호), 다음 약점이 있습니다:
  1. RLS는 정책 누락 시 silent failure(0 rows affected) → server action은 `error: null`로 성공 응답 → 비관리자가 호출하면 "성공처럼 보임" UX 버그.
  2. 신규 테이블/정책 추가 시 한 곳만 잊어도 권한 체크가 사라짐. 방어 깊이가 0.
  3. `setUserStatusAction`(admin-users.ts:33)은 `me!.id === userId`만 체크하고 `me`가 admin인지 검증하지 않음. RLS가 막아주지만 layer 분리 원칙 위배.
- **영향:** 단독으로 즉시 익스플로잇은 어려움. 그러나 CRITICAL-1과 결합 시 미들웨어 우회 + RLS 정책 한 줄 누락이 곧 권한 상승.
- **수정 방법:** 모든 admin server action 진입부에 가드 헬퍼 추가.
  ```ts
  // lib/actions/_guards.ts
  export async function requireAdmin() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('UNAUTHORIZED');
    const { data: p } = await supabase.from('profiles')
      .select('role,status').eq('id', user.id).single();
    if (!p || p.role !== 'admin' || p.status !== 'active') {
      throw new Error('FORBIDDEN');
    }
    return { supabase, user };
  }
  ```

---

### [MEDIUM-2] 외부 HTTP 호출(SSRF 인접) 무제한

- **심각도:** MEDIUM
- **카테고리:** Rate Limiting / SSRF
- **위치:** `lib/delivery/cj.ts:58-126`, 호출자 `app/api/orders/[id]/tracking/route.ts:66`
- **설명:** 활성 유저 1명이 자기 주문 ID로 반복 호출하여 CJ대한통운에 트래픽 증폭 가능. 송장번호 정규화(`/^(\d{10}|\d{12})$/`)가 있어 임의 페이로드 주입은 어렵지만, CJ 측 차단/요금/CDN 캐시 부재(`Cache-Control: no-store`)로 매 요청이 외부 호출 → 비용/장애.
- **영향:** 외부 API 차단(IP block) → 서비스 기능 마비. 비용 증가.
- **수정 방법:**
  - per (user_id, tracking_number) 30초 메모리 캐시 + per-user 분당 N회 제한.
  - 또는 결과를 Supabase에 캐시 테이블로 30~60초 단위 저장.

---

### [MEDIUM-3] 에러 메시지 그대로 클라이언트로 반환

- **심각도:** MEDIUM
- **카테고리:** 정보 노출
- **위치:** 거의 모든 server action — 예시:
  - `lib/actions/admin-products.ts:30,45,53` — `return { error: error.message }`
  - `lib/actions/admin-settings.ts:25`
  - `lib/actions/admin-users.ts:14-17,27,37`
  - `lib/actions/order.ts:51,64`
  - `lib/actions/deposit.ts:23`
  - `lib/actions/admin-deposits.ts:11,20`
- **설명:** Supabase/PostgREST 원본 에러 메시지(`column "x" does not exist`, `permission denied for table profiles`, RLS 조건 등)가 그대로 client에 노출됩니다. 스키마 추론, RLS 정책 추론, 컬럼명 추출이 가능합니다.
- **영향:** 공격자에게 데이터베이스 토폴로지/RLS 윤곽선을 그려줌.
- **수정 방법:** 알려진 비즈니스 에러 코드만 매핑하고 나머지는 일반 메시지로 마스킹.
  ```ts
  if (error) {
    if (error.message.includes('NEGATIVE_BALANCE')) return { error: '잔액이 부족합니다' };
    console.error('[admin-users] adjust', { userId, error });
    return { error: '요청을 처리하지 못했습니다' };
  }
  ```

---

### [MEDIUM-4] 엑셀 업로드 파서 — 신뢰 경계 검증 추가 필요

- **심각도:** MEDIUM
- **카테고리:** 파일 업로드 보안
- **위치:** `lib/actions/order-upload.ts:18-93`, `lib/order-upload-parser.ts:51-137`
- **설명:** 잘 된 점 — 5MB 한도, `.xlsx`만 허용, OOXML 매직바이트 검사, 파싱 실패 시 storage 롤백, `safeName` sanitize, 사용자 폴더 prefix 강제(RLS) 등 방어가 매우 충실합니다. 보완 필요 항목:
  1. ZIP bomb 미방어 — 5MB OOXML이 압축 해제 시 수백 MB 가능. `XLSX.read` 내부 ZIP 처리에 한도 설정 옵션 없음.
  2. `safeName`(`order-upload.ts:51`)가 한글/영숫자/`._-`만 남기지만 Unicode normalization(NFC/NFKC) 미적용 → 같은 보이는 이름 다른 storage path 충돌 위험은 낮으나, 일관성 위해 적용 권장.
  3. `total_amount`가 `Number.MAX_SAFE_INTEGER`를 넘는 단가×수량 입력 시 정밀도 손실(`Number`). 큰 숫자는 추후 RPC가 `bigint`로 다루므로 DB 단계에서 안전하지만, 클라이언트 미리보기는 부정확할 수 있음.
- **영향:** 메모리 폭주(서버 워커 다운).
- **수정 방법:**
  - HIGH-1과 함께 `exceljs`로 이전 시 `streamExcel` 사용 + 행 수 상한(이미 30행 제한 있음).
  - 추가 메모리 안전망: `os.totalmem()` 대비 RSS 모니터링 미들웨어 또는 `--max-old-space-size` 튜닝.

---

### [MEDIUM-5] 비밀번호 정책 약함

- **심각도:** MEDIUM
- **카테고리:** 인증/인가
- **위치:** `lib/schemas.ts:7,22,48`
- **설명:** `z.string().min(8).max(72)` 만 검증. 사전 단어/유출 비번/복잡도 검사 없음. 폐쇄몰 특성상 관리자 계정이 곧 결제 제어권이라 위험.
- **영향:** brute-force(HIGH-2 결합 시) + credential stuffing.
- **수정 방법:**
  - Supabase Auth 대시보드에서 minimum password length 12, "leaked password protection"(HIBP 연동) 활성화.
  - 또는 zxcvbn으로 score ≥ 3 강제.

---

### [LOW-1] `app_settings_read` RLS가 `using (true)`

- **심각도:** LOW
- **카테고리:** 스토리지 보안 / RLS
- **위치:** `supabase/migrations/20260422000002_rls_policies.sql:90-91`
- **설명:** app_settings(은행 계좌 등 입금 안내 정보)가 anon 키로도 조회 가능. 미들웨어가 비로그인 유저를 차단하므로 정규 경로로는 접근 불가지만, 정책 자체는 permissive. anon key가 NEXT_PUBLIC으로 공개돼 있어 외부 쿼리 시 노출 가능성.
- **영향:** 은행명/계좌번호/예금주 노출(공개해도 무방한 입금 안내지만, 사칭 사기 재료가 됨).
- **수정 방법:**
  ```sql
  drop policy app_settings_read on public.app_settings;
  create policy app_settings_read on public.app_settings
    for select using (auth.role() = 'authenticated');
  ```

---

### [LOW-2] 이메일/이름 마스킹 로직 약함

- **심각도:** LOW
- **카테고리:** 정보 노출
- **위치:** `lib/actions/auth.ts:102-108`
- **설명:** `maskEmail("ab@x.com")` → `ab***@x.com`. 짧은 로컬에서 마스킹 자체가 거의 noop. 도메인은 항상 평문으로 노출되므로 회사 이메일 구조 추론 가능.
- **수정 방법:** 도메인도 일부 마스킹(`@x***.com`) 또는 첫 1자 + `***@***`.

---

### [LOW-3] 리프레시/세션 핸들링 — `reset-password` 흐름의 쿠키 만료

- **심각도:** LOW
- **카테고리:** 인증/인가
- **위치:** `app/auth/callback/route.ts:27-35`, `lib/actions/auth.ts:185-204`
- **설명:** `PASSWORD_RECOVERY_COOKIE`가 10분 유효. 합리적이나 `secure: process.env.NODE_ENV === 'production'`만 의존하고 있어, 프록시 뒤에서 NODE_ENV 누락 시 평문 쿠키. CRITICAL-1을 닫으면 미들웨어가 보호하지만, 이중 안전망으로 명시적 production 가드 권장.
- **수정 방법:**
  ```ts
  secure: process.env.NODE_ENV !== 'development',
  ```
  + Vercel 외 배포에 대비 `__Host-` prefix 적용 검토.

---

### [LOW-4] `console.error(error)` — error.tsx

- **심각도:** LOW
- **카테고리:** 정보 노출
- **위치:** `app/error.tsx:14-16`
- **설명:** 클라이언트에서 `console.error(error)` 호출. error.digest만 표시되고 stack은 Next.js가 production build에서 제거하므로 실질 노출은 없음. 의도 확인 차원의 LOW.
- **수정 방법:** 의도가 디버깅이라면 그대로 유지. 운영용 에러 추적은 Sentry 등에 위임.

---

## 우선순위 액션 아이템

| 순위 | 심각도 | 난이도 | 액션 | 예상 소요시간 |
|------|--------|--------|------|---------------|
| 1 | CRITICAL | 낮음 | `pnpm up next@14.2.25` 후 `pnpm test` 통과 확인 (CVE-2025-29927) | 30분 |
| 2 | HIGH | 낮음 | `next.config.mjs`에 보안 헤더 6종 추가 | 30분 |
| 3 | HIGH | 중간 | xlsx → exceljs 마이그레이션 또는 SheetJS CDN 핀 | 2~4시간 |
| 4 | HIGH | 중간 | Upstash 또는 Supabase 기반 rate limiter 도입 (login/find-account/reset/tracking) | 4시간 |
| 5 | HIGH | 낮음 | `findAccountAction`을 generic 응답으로 변경 + reCAPTCHA | 1시간 |
| 6 | HIGH | 낮음 | `pnpm up supabase shadcn @modelcontextprotocol/sdk && pnpm dedupe` | 30분 |
| 7 | MEDIUM | 낮음 | `requireAdmin()` 가드 헬퍼 작성 후 admin-* server actions 일괄 적용 | 2시간 |
| 8 | MEDIUM | 낮음 | server actions의 `error.message` 마스킹 | 1시간 |
| 9 | MEDIUM | 낮음 | 비밀번호 정책 강화(Supabase 대시보드 + min 12) | 15분 |
| 10 | MEDIUM | 중간 | tracking 엔드포인트 캐시/리미트 | 2시간 |
| 11 | LOW | 낮음 | `app_settings_read` 정책을 authenticated 한정 | 15분 |
| 12 | LOW | 낮음 | 이메일 마스킹 강화 | 15분 |

---

## 권장사항

1. **방어 깊이 원칙 도입.** 인증/인가는 ① 미들웨어 ② 라우트/레이아웃 server component ③ server action 가드 ④ RLS 의 4중 체계여야 합니다. 현재는 ①④에 치우쳐 있어 한 층 무너지면 즉시 사고. CRITICAL-1이 그 위험을 실증합니다.
2. **에러 채널 분리.** 사용자에게 보여줄 메시지와 운영 로그를 분리. `lib/log.ts`로 통일된 로깅 유틸을 만들고 `console.error` 대신 사용해 추후 Sentry 등으로 redirect 가능하게.
3. **자동 보안 회귀 방지.** GitHub Actions에 `pnpm audit --prod --audit-level=high` + `pnpm exec eslint-plugin-security` 정기 작업 추가. Dependabot 또는 Renovate로 next/supabase 알람.
4. **민감 server action 입력 검증 일관성.** `admin-orders.ts`의 `markShippedAction(orderId, tracking, carrier)`처럼 zod 검증이 빠진 곳이 있습니다(SQL은 RPC가 잡아주지만 형식 검증은 클라이언트로 하면 안 됨). 모든 server action에 입력 zod 스키마를 표준화.
5. **운영 단계 모니터링.** rate limiter 도입과 함께 로그인 실패율/이상 트래픽 알림(Supabase Realtime 또는 Sentry Performance) 구성.
