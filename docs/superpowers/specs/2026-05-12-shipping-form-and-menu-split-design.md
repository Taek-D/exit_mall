# 배송대행 양식·메뉴 분리, 임계치·주문이력 정비 — 설계

작성일: 2026-05-12
브랜치: `feature/20260512`
근거 요청서: `20260512.txt`

## 배경

기존 단일 "배송대행 업로드" 메뉴를 CJ대한통운 표준 양식으로 전환하고, 향후 사입재고(자체 매입 재고) 배송대행 흐름을 위해 메뉴 골격을 분리한다. 동시에 관리자 사용자 상세의 주문 이력 탭이 신규 흐름(`stock_orders`, `order_uploads`)을 반영하지 않아 비어 보이는 버그를 해소하고, 잔액부족 임계치 기본값을 현실에 맞게 100,000원으로 올린다.

본 설계는 4개 독립 변경을 한 PR 단위로 묶는다. 각 변경은 데이터 영향이 작고 서로 결합되어 있지 않다.

## 범위

- 배송대행 업로드 양식을 CJ 표준 헤더(`받는분성명/받는분전화번호/…/내품수량/배송메세지1`)로 교체하고 파서가 신·구 헤더를 모두 인식하도록 한다.
- 송장번호 컬럼이 엑셀에 붙여넣어졌을 때 지수표기(`5.21853E+11`)로 깨지지 않도록 양식과 파서 양쪽에서 방어한다.
- `/shipping-uploads`를 `/shipping-uploads/exitmall` + `/shipping-uploads/purchased`로 분리한다. 사입재고 쪽은 본구현 전까지 "준비중" 페이지로 자리만 잡는다. 관리자 측도 동일하게 분리한다.
- `profiles.low_balance_threshold`의 DB default를 100,000으로 변경하고, 현재 값이 정확히 이전 default(10,000)인 사용자만 일괄 갱신한다.
- 관리자 사용자 상세의 "주문 이력" 탭을 `stock_orders` + `order_uploads`(엑시트몰 배송대행) + legacy `orders` 통합 시간순 표시로 교체한다.

## 비범위

- 사입재고 배송대행의 실제 구현 — 별도 마일스톤. 본 설계에서는 메뉴 자리(준비중)만 만든다. 첨부된 `입고리스트 양식.xlsx`도 이번 범위 아님.
- 잔액부족 임계치 단위(원/만원) 표시, UI 입력 검증 강화 — 별건.
- 통합 주문 이력 탭의 페이지네이션·필터 — 데이터량 증가 시 별건.

## 섹션 1 — CJ 양식 적용

### 1.1 양식 파일 교체

- `public/shipping-template.xlsx`를 첨부 양식(`배송대행 업로드 엑셀양식.xlsx`)로 교체.
- 다운로드 링크(`app/(user)/shipping-uploads/exitmall/page.tsx`의 `<a href="/shipping-template.xlsx">`)는 동일 경로를 유지하므로 코드 변경 불필요.

### 1.2 파서 헤더 호환

`lib/shipping-upload-parser.ts`의 `HEADER_KEYS`에 신규 헤더 alias 추가. 기존 양식도 그대로 동작.

```ts
const HEADER_KEYS = [
  ['no'],
  ['받는사람', '받는분성명'],
  ['연락처', '받는분전화번호'],
  ['주소', '받는분주소(전체,분할)', '받는분주소'],
  ['상품명', '품목명', '관리코드'],
  ['옵션', '내품명', '상품명/옵션'],
  ['수량', '내품수량'],
  ['메모', '배송메세지1'],
  ['송장번호'],
];
```

- `normalizeHeader`가 공백과 특수문자 일부를 제거하므로 `받는분주소(전체, 분할)`도 매칭된다. 괄호와 쉼표가 남는다면 `normalizeHeader`에 보강(공백·괄호·쉼표 strip)을 추가한다.
- `ParsedShippingItem` 내부 키 이름(`recipient`, `phone`, `address`, `product_code`, `product_name`, `quantity`, `memo`, `tracking_number`)은 그대로 둔다. DB(`order_uploads.items` JSON), 다운스트림 RPC, 기존 단위 테스트와의 호환 유지.

### 1.3 송장번호 지수표기 방지

두 단계 방어 (사실 확인: 첨부된 `배송대행 업로드 엑셀양식.xlsx`의 8행 헤더 검사 결과 컬럼 2~8은 `numFmt="@"`(텍스트)로 지정되어 있으나 9번 `송장번호` 컬럼만 `numFmt=undefined`임. 이것이 정확한 버그 원인.)

1. **양식 파일 가공** — `public/shipping-template.xlsx`로 복사하기 전 `exceljs`로 일회성 스크립트를 실행해 송장번호 컬럼 전체(헤더 9행부터 끝까지)의 `numFmt`를 `@`(텍스트)로 강제 설정 후 저장. 또는 Excel에서 I열 전체를 선택 → 셀 서식 → "텍스트"로 지정 후 저장. 결과 파일을 `public/shipping-template.xlsx`로 배포.
2. **파서 안전망** — 송장번호 셀에 한해 숫자가 들어와도 정수 문자열로 변환. `cellTrackingNumber(value)` 헬퍼를 추가하고, `parseShippingExcel` 안의 `tracking_number = cellString(cells[8])` 호출만 이 헬퍼로 교체.

```ts
function cellTrackingNumber(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.trunc(raw).toString();
  }
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}
```

### 1.4 안내 문구 변경

`app/(user)/shipping-uploads/exitmall/page.tsx`(이동 후 위치)의 안내 카피:

- 기존: `"받는사람 / 연락처 / 주소 / 상품명 / 수량" 을 행마다 입력해주세요.`
- 신규: `"받는사람 / 연락처 / 주소 / 품목명 / 내품명(=옵션) / 수량" 을 행마다 입력해주세요.`

페이지 헤더 카피도 "엑시트몰 배송대행"으로 변경(섹션 2와 함께).

### 1.5 테스트

- `tests/unit/shipping-upload-parser.test.ts`에 신규 헤더만 들어간 픽스처(`tests/fixtures/shipping-valid-cj.xlsx`)로 케이스 추가. 신·구 헤더 모두 같은 결과를 내야 함.
- 송장번호가 number로 들어온 셀에 대한 단위 테스트 추가(`cellTrackingNumber`가 정수 문자열을 반환).

## 섹션 2 — 메뉴 분리 (방안 B)

### 2.1 라우트 재편

| 변경 전 | 변경 후 |
|---|---|
| `app/(user)/shipping-uploads/page.tsx` | `app/(user)/shipping-uploads/page.tsx` → redirect to `/shipping-uploads/exitmall` |
| — | `app/(user)/shipping-uploads/exitmall/page.tsx` (기존 내용) |
| — | `app/(user)/shipping-uploads/purchased/page.tsx` (준비중) |
| `app/(user)/shipping-uploads/[id]/page.tsx` | `app/(user)/shipping-uploads/exitmall/[id]/page.tsx` |
| `app/(admin)/admin/shipping-uploads/page.tsx` | `app/(admin)/admin/shipping-uploads/page.tsx` → redirect to `/admin/shipping-uploads/exitmall` |
| — | `app/(admin)/admin/shipping-uploads/exitmall/page.tsx` |
| — | `app/(admin)/admin/shipping-uploads/purchased/page.tsx` (준비중) |
| `app/(admin)/admin/shipping-uploads/[id]/page.tsx` | `app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx` |

기존 동거 컴포넌트(`UploadForm.tsx`, `ReviewActions.tsx`, `AttachTrackingForm.tsx`, `CompleteButton.tsx`, `DownloadButton.tsx` 등)는 페이지 파일과 함께 새 디렉토리로 이동. 상대 import 경로는 동일하게 유지되므로 내부 참조는 그대로 동작.

### 2.2 준비중 페이지

공통 컴포넌트 `components/ComingSoon.tsx`:

```tsx
type ComingSoonProps = { title: string; description?: string };
```

- lucide-react `Construction` 아이콘 + 큰 제목 + 1줄 설명
- 페이지에서는 `<ComingSoon title="사입재고 배송대행" description="현재 준비 중입니다. 곧 오픈됩니다." />`

사이드 네비게이션에도 일반 메뉴 항목처럼 노출되며, 클릭 시 본 화면을 표시한다.

### 2.3 사이드 네비게이션 갱신

사용자/관리자 레이아웃의 사이드 네비 정의에서 "배송대행 업로드" 단일 항목을 두 항목으로 분리:

- `엑시트몰 배송대행` → `/shipping-uploads/exitmall`
- `사입재고 배송대행` → `/shipping-uploads/purchased`

관리자도 동일 패턴(`/admin/shipping-uploads/exitmall`, `/admin/shipping-uploads/purchased`). 활성 메뉴 강조 로직은 정확한 prefix match가 되도록 확인.

### 2.4 부수적 갱신

- `lib/actions/shipping-upload.ts`의 `revalidatePaths(['/shipping-uploads', '/admin/shipping-uploads'])` 호출을 `/shipping-uploads/exitmall`, `/admin/shipping-uploads/exitmall` 포함하도록 확장. 동일한 패턴이 다른 server action에 있다면 일괄 갱신.
- `<Link href="/shipping-uploads/...">`, `<Link href="/admin/shipping-uploads/...">` 사용처 전수 검토 후 새 경로로 교체. 단, 루트 redirect 페이지가 있으므로 누락된 곳도 결국 새 경로로 안내됨.
- 페이지 헤더 제목: 사용자 측 "배송대행 업로드" → "엑시트몰 배송대행", 관리자 측 동일.

### 2.5 데이터 레이어 영향

- `lib/orders/queries.ts`(`fetchRecentShippingUploads`, `fetchAdminShippingUploads`) 등 데이터 함수는 변경 없음 — 순수 URL 재배치.
- `ShippingUploadStatusBadge`, `OrdersRealtime`, `StatusBadge` 등 컴포넌트도 변경 없음.

## 섹션 3 — 잔액부족 임계치 기본값 100,000원

### 3.1 마이그레이션

새 파일: `supabase/migrations/20260512000001_low_balance_threshold_default_100k.sql`

```sql
alter table public.profiles
  alter column low_balance_threshold set default 100000;

update public.profiles
   set low_balance_threshold = 100000
 where low_balance_threshold = 10000;
```

멱등(default 재설정은 멱등, update는 10,000인 행만 한 번 100,000으로 갱신).

### 3.2 handle_new_user 영향

사실 확인: `supabase/migrations/20260422000001_initial_schema.sql:21-27`의 `handle_new_user()`는 INSERT문에 `id, email, name, phone`만 명시하고 `low_balance_threshold`는 명시하지 않음. 따라서 신규 가입자에게는 컬럼의 DB default 값이 자동 적용됨 — 본 마이그레이션에서 default를 100,000으로 바꾸는 것만으로 신규 가입자에게 즉시 반영됨. 함수 본문은 변경 불필요.

### 3.3 영향 범위

- `admin/users/[id]/page.tsx`의 임계치 표시(`Metric label="임계치" value={formatKRW(Number(user.low_balance_threshold))}`)는 자동으로 새 값으로 표시 — 코드 변경 불필요.
- `admin/low-balance/page.tsx`(예치금 부족 대시보드)는 사용자별 임계치를 기준으로 동작하므로 마이그레이션 후 결과 집합이 달라질 수 있음 — 의도된 변화. 대시보드 자체 로직은 변경 없음.

## 섹션 4 — 관리자 사용자 상세 주문이력 통합

### 4.1 데이터 모델

`lib/admin/user-detail.ts`에 통합 row 타입 추가:

```ts
export type AdminUserUnifiedOrder = {
  id: string;
  kind: 'stock_order' | 'shipping_upload' | 'legacy';
  status: string;       // 종류별 상태 문자열 (badge 컴포넌트가 분기 처리)
  amount: number;       // stock_order/legacy: total_amount, shipping_upload: shipping_fee_total
  summary: string;      // "샴푸 외 2건 · 5개" 또는 파일명 등
  created_at: string;
};
```

`AdminUserDetail`의 `orders: AdminUserOrder[]`를 `orders: AdminUserUnifiedOrder[]`로 교체.

### 4.2 조회 — `fetchAdminUserDetail` 확장

`Promise.all`에 두 개 더 추가:

- `supabase.from('stock_orders').select('id, total_amount, status, created_at, items').eq('user_id', userId).order('created_at', { ascending: false })`
- `supabase.from('order_uploads').select('id, original_name, total_quantity, shipping_fee_total, status, created_at').eq('user_id', userId).order('created_at', { ascending: false })`

세 결과를 통합 row 배열로 매핑한 뒤 `created_at desc`로 머지. 각 소스가 이미 정렬된 상태이므로 머지 시 비용 낮음.

`calculateTotalSpent`는 `stock_orders` + legacy `orders`의 `status !== 'cancelled'` 합계로 의미 명확화. 배송대행 비용은 별도(이번에는 totalSpent에서 제외). 별도 metric 추가 여부는 본 설계 비범위.

### 4.3 UI 변경 — `app/(admin)/admin/users/[id]/page.tsx`

기존 4열 테이블을 5열로 확장:

| 종류 | 식별 | 금액 | 상태 | 시간 |
|---|---|---|---|---|
| `엑시트몰 구매` / `배송대행` / `Legacy` | id 슬라이스 또는 파일명 | `formatKRW(amount)` | kind에 따라 적합한 badge | `formatDateTimeKR` |

상태 배지는 `kind`에 따라 분기:

```tsx
{row.kind === 'stock_order' && <StockOrderStatusBadge status={row.status as StockOrderStatus} />}
{row.kind === 'shipping_upload' && <ShippingUploadStatusBadge status={row.status as ShippingUploadStatus} />}
{row.kind === 'legacy' && <OrderStatusBadge status={row.status as OrderStatus} />}
```

빈 상태 카피: "주문/배송대행 이력이 없습니다".

식별 셀은 stock_order/legacy의 경우 `<Link href="/admin/orders/${id}" />` 또는 `/admin/orders-legacy/${id}`, shipping_upload는 `<Link href="/admin/shipping-uploads/exitmall/${id}">{original_name 자르기}</Link>`.

### 4.4 테스트

- `lib/admin/user-detail.ts`에 새 매핑/머지 함수를 export하고 단위 테스트 추가(세 소스 row가 시간순으로 머지되는지 검증).
- E2E/페이지 렌더 테스트는 본 범위 밖이지만, 수동 검증 항목으로 "stock_orders가 있는 사용자 → 주문이력 탭에 표시됨"을 포함.

## 검증 체크리스트

- [ ] 신규 양식·구 양식 둘 다 업로드 성공, 송장번호를 셀에 그대로 복붙해도 지수표기 없이 정상 저장.
- [ ] `/shipping-uploads`, `/admin/shipping-uploads` 접속 시 각각 `/exitmall`로 redirect.
- [ ] 사이드 네비에 두 메뉴가 보이고, "사입재고 배송대행"은 준비중 페이지 표시.
- [ ] 마이그레이션 후 신규 가입자의 임계치가 100,000으로 생성, 기존 10,000 사용자는 100,000으로, 다른 값(예: 50,000) 보존.
- [ ] 관리자 사용자 상세 "주문 이력" 탭에 stock_orders + 배송대행 + legacy가 시간순으로 통합 표시.
- [ ] 기존 단위 테스트 전부 통과(`pnpm test`), typecheck 통과(`pnpm typecheck`), lint 통과(`pnpm lint`).

## 리스크

- **양식 파일 가공 누락**: 송장번호 컬럼을 텍스트 서식으로 바꾸지 않은 채 `public/shipping-template.xlsx`로 배포하면 사용자 측 지수표기 문제가 그대로 재발. 파서 안전망이 있어 DB 저장은 안전하지만, 사용자가 엑셀 화면에서 보는 송장번호가 깨진 채로 업로드되는 경험 발생. 양식 가공을 PR 체크리스트에 명시.
- **legacy `orders` 데이터 양**: 통합 머지는 in-memory이므로 사용자별 수천 row 이상이면 성능 영향. 현재 데이터량 기준으로는 무시 가능. 페이지네이션은 별건.
- **`revalidatePaths` 누락**: 새 경로로 옮긴 뒤 server action들이 옛 경로만 revalidate하면 캐시 부정합 발생. 일괄 검색·교체 필수.
- **사이드 네비 정의 위치 불명**: 본 설계 작성 시점에 사이드 네비가 어디서 정의되는지(레이아웃 컴포넌트 vs 별도 nav 정의 파일) 확인하지 않음. 구현 phase 첫 단계에서 위치 파악 후 단일 지점 갱신.
