# 운영 절차

## 준비물

로컬 개발에는 Node.js 20 이상, pnpm 10 이상, Docker Desktop, Supabase CLI가 필요하다. Supabase 로컬 실행은 Docker 이미지를 받으므로 첫 실행에 시간이 걸릴 수 있다.

## 로컬 설치

의존성을 먼저 설치한다.

```bash
pnpm install
```

Supabase 로컬 서비스를 시작한다.

```bash
pnpm exec supabase start
```

Windows에서 Supabase 명령이 잡히지 않으면 패키지 바이너리를 직접 호출한다.

```bash
./node_modules/supabase/bin/supabase.exe start
```

`.env.local`을 만들고 로컬 Supabase 출력값을 넣는다.

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<로컬 anon key>
SUPABASE_SERVICE_ROLE_KEY=<로컬 service_role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

DB를 초기화하고 타입을 생성한다. DB reset이 먼저이며, 타입 생성은 reset 후 현재 스키마를 기준으로 수행한다.

```bash
pnpm exec supabase db reset
pnpm exec supabase gen types typescript --local > lib/db-types.ts
```

개발 서버를 실행한다.

```bash
pnpm dev
```

앱은 `http://localhost:3000`에서 열린다.

## 첫 관리자 만들기

첫 관리자는 승인해 줄 관리자가 없기 때문에 수동으로 승격한다.

1. `/signup`에서 관리자 이메일로 가입하거나 Supabase Studio Auth 화면에서 사용자를 만든다.
2. Supabase Studio SQL Editor에서 프로필을 관리자와 활성 상태로 바꾼다.

```sql
update public.profiles
set role = 'admin', status = 'active', approved_at = now()
where email = 'admin@example.com';
```

3. `/login`으로 로그인한 뒤 `/admin/settings`에서 입금 계좌 정보를 입력한다.

## 검증 명령

타입 검사는 TypeScript와 Supabase 타입 불일치를 잡는다.

```bash
pnpm typecheck
```

단위 테스트는 파서, 권한, 계산, 서버 액션 주변 순수 로직을 확인한다.

```bash
pnpm test
```

E2E 테스트는 인증 스모크와 주요 로컬 시나리오를 확인한다.

```bash
pnpm test:e2e
```

릴리즈 전에는 다음 순서로 확인한다.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm lint`는 Next 14 프로젝트의 lint 스크립트다. 로컬 환경에서 Next lint 지원 문제가 생기면 원인을 기록하고 대체 확인 없이 통과 처리하지 않는다.

## 엑셀 템플릿 생성

배송대행 공식 템플릿은 스크립트로 다시 만들 수 있다.

```bash
node scripts/build-shipping-template.cjs
```

입고리스트 템플릿도 별도 스크립트로 생성된다.

```bash
node scripts/build-inbound-template.cjs
```

템플릿을 바꾸면 파서의 헤더 허용 목록과 테스트 파일도 함께 확인한다.

## 프로덕션 배포

Supabase 클라우드 프로젝트를 만들고 프로젝트 URL과 anon/service role 키를 확인한다.

로컬 저장소를 프로덕션 프로젝트에 연결한다.

```bash
supabase link --project-ref <project-ref>
```

마이그레이션 차이를 확인한 뒤 푸시한다.

```bash
supabase db diff --linked
supabase db push
```

Vercel에 프로젝트를 연결하고 다음 환경 변수를 설정한다.

```bash
NEXT_PUBLIC_SUPABASE_URL=<production Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon key>
SUPABASE_SERVICE_ROLE_KEY=<production service role key>
NEXT_PUBLIC_SITE_URL=<production site URL>
```

Supabase Auth URL Configuration에서 Site URL을 실제 서비스 주소로 맞추고 Redirect URLs에 `<production site URL>/auth/callback`을 추가한다.

프로덕션 DB는 Point-in-Time Recovery를 켜거나, 큰 마이그레이션 전 수동 백업을 만든다. 배송대행 흐름처럼 기존 검토대기 데이터와 충돌할 수 있는 변경은 배포 전에 잔여 검토대기 행을 처리한다.

## 배포 후 확인

로그인 화면이 응답하는지 확인한다.

```bash
curl -I https://<배포-도메인>/login
```

구 배송대행 경로가 새 경로로 이동하는지 확인한다.

```bash
curl -I https://<배포-도메인>/orders/upload
```

관리자 계정으로 로그인해 가입 승인, 입금 확인, 상품 구매 승인, 배송대행 승인, 송장 재업로드, 입고리스트 댓글, CS 문의 댓글 중 배포 범위와 관련된 흐름을 직접 확인한다.
