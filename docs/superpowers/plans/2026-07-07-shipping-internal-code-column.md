# 배송대행 양식 "내품코드"(A열) 추가 — 구현 계획

작성일: 2026-07-07
상태: 구현 완료 (브랜치 `feature/shipping-internal-code`, 미커밋). typecheck·lint·전체 테스트(472) 통과.

## 구현 메모 (계획 대비 조정)

- **필드명**: `internal_code`(nullable), 라벨 "내품코드"로 확정 구현.
- **신양식 필수**: 신양식 데이터 행에 내품코드 비면 `{n}행 내품코드가 비어있습니다.` 로 거부.
- **픽스처 전략 조정**: 계획의 "기존 6개를 신양식으로 재생성"은 diff 노이즈만 늘어 실익이 없어,
  기존 6개(구양식·메타블록)는 **그대로 두어 하위호환 검증 세트로 활용**하고,
  신양식 검증용 픽스처 2개(`shipping-internal-code-valid.xlsx`, `shipping-internal-code-missing.xlsx`)만
  추가했다. 신양식 end-to-end는 `shipping-template.test.ts`(실제 `public/shipping-template.xlsx` 파싱)로도 커버.

## 배경

택배사(CJ대한통운) 시스템이 배송 내역에서 "누구 제품인지" 구분하지 못하는 문제.
같은 제품이 여러 신청자로부터 입고될 때 식별이 어려움. 이를 해결하기 위해
배송대행 엑셀 양식 **맨 앞(A열)에 "내품코드" 열**을 추가한다.

- **열 이름은 정확히 `내품코드`** (CJ 시스템이 이 문구를 인식). 병기·설명 X.
- **입력값은 신청자 성함(이름).** 사용자 안내는 운영팀이 "신청자 적는 란"으로 별도 안내.
- 적용 대상: **엑시트몰 배송대행 + 사입재고 배송대행 둘 다.**

## 확정된 설계 결정

| 항목 | 결정 |
|---|---|
| 저장 | 내품코드 값을 `order_uploads.items` JSON에 저장. 코드 필드명 `internal_code`, 화면/양식 라벨은 항상 "내품코드" |
| 신양식 미기입 | **필수.** 신양식(A열=내품코드)에서 데이터 행의 내품코드가 비어 있으면 업로드 거부 |
| 하위 호환 | A열이 `내품코드`(신양식) / `고객주문번호`·`No`(구양식) 둘 다 허용. 구양식은 `internal_code = null` |
| 범위 | **배송대행 전용.** 입고리스트(`inbound-template.xlsx`, `parseInboundInventoryExcel`)는 미변경 |
| DB | **마이그레이션 없음** (RPC는 item을 이름 기준으로만 읽어 미지 키를 거부하지 않음 — 검증 완료) |

## 현재 구조 (변경 전)

배송대행은 **파서 1개 + 양식 파일 1개**를 세 경로가 공유한다.

```
엑시트몰 업로드   ─┐
사입재고 업로드   ─┼─▶ parseShippingExcel()  ◀─ public/shipping-template.xlsx (다운로드)
송장 재업로드(관리자) ─┘   (lib/shipping-upload-parser.ts)
```

- 다운로드 링크: `app/(user)/shipping-uploads/exitmall/page.tsx`, `.../purchased/page.tsx` 모두 `/shipping-template.xlsx` 하나를 가리킴.
- 업로드 액션: `requestShippingUploadAction`, `requestPurchasedShippingUploadAction` (`lib/actions/shipping-upload.ts`) → `parseShippingExcel`.
- 송장 재업로드: `attachTrackingAction` (`lib/actions/admin-attach-tracking.ts`) → `parseShippingExcel`.
- 세 경로 모두 파싱된 item을 `...item` 스프레드로 저장 → **`internal_code`를 파서가 채우면 저장까지 자동 반영**(호출부 코드 수정 불필요).

### 왜 코드 변경이 필요한가

현재 `parseShippingExcel`은 **A열(1열)이 반드시 `고객주문번호`/`No`** 여야 헤더 행으로 인식하고,
이후 값들을 **고정 열 번호**로 읽는다. A열에 `내품코드`가 오면:
1. 헤더 행 탐지 실패 → `양식의 헤더 행을 찾을 수 없습니다` 에러로 업로드 전면 중단.
2. (설령 통과해도) 모든 열이 한 칸 밀려 상품명·수량·송장이 엉뚱한 칸에서 읽힘.

## 컬럼 매핑

| 논리 컬럼 | 구양식(9열) | 신양식(10열) | 파서 필드 |
|---|---|---|---|
| (신규) 내품코드 | — | A | `internal_code` (신양식 필수) |
| 주문번호(앵커, 미저장) | A `고객주문번호`/`No` | B `고객주문번호` | — |
| 받는사람 | B | C | `recipient` |
| 연락처 | C | D | `phone` |
| 주소 | D | E | `address` |
| 상품명/품목명 | E | F | `product_code` |
| 옵션/내품명 | F | G | `product_name` |
| 수량/내품수량 | G | H | `quantity` |
| 메모/배송메세지1 | H | I | `memo` |
| 송장번호 | I | J | `tracking_number` |

## 파서 동작 (핵심 로직)

헤더 행 탐지 시 **오프셋을 자동 판별**한다.

- A열 정규화값 ∈ {`no`, `고객주문번호`} → **구양식**: `offset = 0`, `hasInternalCode = false`
- A열 = `내품코드` **그리고** B열 ∈ {`no`, `고객주문번호`} → **신양식**: `offset = 1`, `hasInternalCode = true`
- 그 외 → 다음 행 계속 스캔

이후 모든 컬럼을 `offset` 기준으로 읽는다. 헤더 검증(앞 7열)도 `offset`부터 검사.

의사코드:
```ts
// 헤더 탐지
const anchorKeys = HEADER_KEYS[0].map(normalizeHeader);      // no / 고객주문번호
const internalCodeKeys = ['내품코드'].map(normalizeHeader);
for (row of rows) {
  const c0 = normalizeHeader(cell(row,1)), c1 = normalizeHeader(cell(row,2));
  if (anchorKeys.includes(c0))           { headerRow=row; offset=0; hasInternalCode=false; break; }
  if (internalCodeKeys.includes(c0) && anchorKeys.includes(c1))
                                         { headerRow=row; offset=1; hasInternalCode=true; break; }
}

// 행 읽기 (maxCols = offset + HEADER_KEYS.length)
internal_code   = hasInternalCode ? cellString(cells[0]) : null;
recipient       = cellString(cells[offset+1]);
// ... 이하 offset 기준
tracking_number = cellTrackingNumber(cells[offset+8]);

// 신양식 필수 검증 (빈 행 skip 이후, 기존 필드 검증과 함께)
if (hasInternalCode && !internal_code)
  throw new Error(`${rowNumber}행 내품코드가 비어있습니다.`);
```

빈 행 skip 판정(`!recipient && !phone && !address && !product_code && quantity===null`)은 그대로 두고,
`internal_code` 필수 검사는 **실제 데이터 행(skip 안 된 행)** 에만 적용한다.

## 작업 목록

### ① 타입·파서 — `lib/shipping-upload-parser.ts`
- `ParsedShippingItem`에 `internal_code: string | null` 추가.
- 헤더 탐지에 오프셋 판별(위 의사코드), `rowValues` maxCols를 `offset + HEADER_KEYS.length`로.
- 헤더 검증 루프(앞 7열)를 `offset` 기준으로 검사.
- 행 읽기 인덱스를 `offset` 기준으로 변경, `internal_code` 채움.
- 신양식(`hasInternalCode`) 데이터 행에 내품코드 비면 에러.

### ② 양식 자동 감지 — `lib/excel-template-kind.ts`
- `detectKnownExcelTemplateKind`의 shipping 감지에 동일 오프셋 반영
  (A열 앵커 또는 `내품코드`+B열 앵커 → 이후 7열 alternatives 검사).
- 목적: 신양식을 입고리스트 페이지에 잘못 올렸을 때 교차 가드 메시지("배송대행 양식이 업로드되었습니다") 정상 동작 유지.
- 입고리스트 감지(`발송일` 시작 8열)는 변경 없음.

### ③ 양식 파일 재생성 — `scripts/build-shipping-template.cjs` → `public/shipping-template.xlsx`
- HEADER 10열로 변경: `['내품코드','고객주문번호','받는분성명','받는분전화번호','받는분주소(전체, 분할)','품목명','내품명','내품수량','배송메세지1','송장번호']`.
- 열폭·헤더 스타일은 첨부 파일 기준(볼드, Malgun Gothic, 회색 채움 `FFDDDDDD`, 가운데 정렬).
- **J열(송장번호, 10열) `@` 텍스트 서식 적용** — 지수표기 방지 보호장치 유지(기존엔 9열에 적용).
- 스크립트 실행 후 산출물 `public/shipping-template.xlsx` 커밋.
- 참고: 기존 일회성 스크립트 `scripts/prepare-shipping-template.ts`는 헤더행/송장열 번호가 옛 레이아웃(HEADER_ROW=8, TRACKING_COL=9) 기준 → 재사용 시 값 갱신 필요. 본 계획은 `build-shipping-template.cjs`를 단일 생성 소스로 사용.

### ④ 테스트·픽스처
- `tests/fixtures/build-shipping-fixtures.cjs`
  - HEADER_ROW·데이터에 `내품코드` 열 추가하여 기존 6개 `shipping-*.xlsx`를 **신양식으로 재생성**(내품코드 채움).
  - **하위호환 검증용 구양식 픽스처 1개 추가** (예: `shipping-valid-legacy.xlsx`, 내품코드 열 없음).
  - **신양식 내품코드 누락 픽스처 추가** (예: `shipping-missing-internal-code.xlsx`).
- `tests/unit/shipping-upload-parser.test.ts`
  - 신양식: `internal_code` 파싱·저장 확인 케이스 추가.
  - 신양식 내품코드 누락 → `내품코드가 비어있습니다` throw 케이스 추가.
  - 구양식(내품코드 열 없음) → 정상 파싱 + `internal_code === null` 케이스 추가/유지.
  - 인라인 헬퍼(`workbookBuffer`, `workbookBufferFromFirstRow`)에 내품코드 열 반영.
- `tests/unit/shipping-template.test.ts`
  - `EXPECTED_HEADER`를 10열(내품코드 선두)로.
  - 송장 서식 열 번호 9 → 10.
  - 샘플 `addRow`에 내품코드(신청자명) 포함(신양식 필수 충족).

### ⑤ (권장) 관리자 화면 표시
- `app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx`
- `app/(admin)/admin/shipping-uploads/purchased/[id]/page.tsx`
- 항목 테이블에 "내품코드" 컬럼 추가 → 운영자가 웹에서 신청자 확인(택배사 문의 대응 목적에 부합).
- 고객 상세 화면(`app/(user)/shipping-uploads/{exitmall,purchased}/[id]/page.tsx`) 노출은 선택.

## 검증

- `pnpm test` — 파서/템플릿 유닛 및 연관 테스트(`shipping-upload-parser`, `shipping-template`, `shipping-upload-rpc`, `attach-tracking-action`, `purchased-shipping`) 통과.
- 수동:
  - 신양식 xlsx 업로드 → 엑시트몰 / 사입재고 / 송장 재업로드 3경로 정상, `items[].internal_code` 저장 확인.
  - 신양식 내품코드 빈 행 → 업로드 거부 메시지 확인.
  - 구양식(9열) xlsx 업로드 → 정상(하위 호환), `internal_code` 없음.
  - 재생성한 `public/shipping-template.xlsx` 열어 헤더·J열 텍스트 서식 확인.

## 롤아웃 / 하위 호환

- 이미 구(9열) 양식을 받아둔 고객이 배포 후 업로드해도 파서가 구양식으로 인식 → 중단 없음.
- 신규 다운로드는 10열 양식(내품코드 필수)로 안내.
- `internal_code`는 items JSON에만 얹히므로 기존 데이터/RPC와 충돌 없음(마이그레이션 불필요).

## 범위 밖

- 입고리스트 양식/파서(`public/inbound-template.xlsx`, `lib/purchased-shipping.ts:parseInboundInventoryExcel`).
- 예치금·재고 차감 로직(항목 매핑만 올바르면 금액/수량 영향 없음).
- 배송비 정산(행 수 × 3,300 유지, 내품코드는 요금과 무관).

## 리스크 / 주의

- **CJ 인식 조건**: 헤더 문자열이 정확히 `내품코드`여야 함. `normalizeHeader`는 소문자화·공백/괄호 제거만 하므로 `내품코드`는 원문 그대로 저장돼야 함(양식 파일에서 헤더 텍스트 확인).
- **내품코드 = 개인 이름(개인정보)**: `order-uploads`는 비공개 버킷 + RLS라 신규 노출 경로 없음. 관리자 화면 표시 시에도 기존 권한 경계 내.
- **필수 검증 위치**: 빈 행 skip 이후에 검사하여, 완전 공백 행은 통과시키고 실제 데이터 행만 내품코드를 강제.
