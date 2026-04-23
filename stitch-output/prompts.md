# Stitch Prompts — 엑시트몰 UI Redesign
_Generated from MASTER.md. Each prompt is a complete design brief for both Stitch MCP and Phase 3 direct implementation._

**Global design tokens (apply to all screens):**
- Style: Swiss Modernism 2.0 + Minimalism — 12-column grid, 8px base, WCAG AAA contrast, no decorative shadows
- Palette: slate-950 text, slate-600 secondary, sky-700 (#0369A1) CTA, slate-50 surface, white bg, slate-200 borders
- Typography: Lexend (headings 600 weight), Source Sans 3 (body 400), JetBrains Mono (numbers)
- Radius: 6px buttons/inputs, 8px cards
- Motion: 150-200ms transitions, ease-out-expo, prefers-reduced-motion respected
- Icons: lucide-react only (no emoji)
- Density: high — row 44px, tabular-nums for money/counts

---

## Tier 1 — Core flows

### 1. `/admin` — Admin Dashboard (DESKTOP)

Modern minimalist B2B admin dashboard for a deposit-based closed marketplace. Swiss Modernism 2.0 style with strict 12-column grid.

**Layout**: Left sidebar (240px fixed, white bg, slate-200 right border) with logo header, nav items (Dashboard/Approvals/Deposits/Orders/Products/Users/Low-balance/Settings) using lucide icons, active item has slate-900 bg + white text. Top header (64px) with page title "대시보드", current admin email on right with avatar dropdown. Main content area with 24px padding.

**Content sections (top to bottom)**:
1. **KPI row** (4 cards, equal width, gap 16px): "오늘 주문 건수" / "오늘 입금 요청" / "승인 대기" / "잔액 부족 고객" — each card: slate-500 uppercase label (11px, tracking-wide), large number (30px JetBrains Mono 600), trend sparkline or delta (emerald/red 12px), 1px slate-200 border, no shadow.
2. **Realtime 주문 피드** (8 cols, left): section header "실시간 주문" with pulsing sky-700 dot, table (주문번호/고객/금액/시간/상태 배지) sticky header, 10 recent rows, density-high, monospace on 주문번호 and 금액.
3. **활동 요약** (4 cols, right): "최근 활동" list — 6 items with lucide icon (ShoppingCart/UserPlus/Wallet/Package), 1-line text, 시간 (slate-400). Bottom CTA "전체 보기" as ghost button.
4. **하단 2 cols**: "잔액 부족 경고" (6 cols) — red-600 accent border-l-4, 테이블 3 rows, "상세 보기" 링크 / "오늘의 매출" (6 cols) — 간단한 bar chart, 7일 추이.

**Interactions**: new order toast slides in top-right with sky-700 bg, auto-dismiss 4s. Hover on KPI card: subtle slate-50 bg. Sidebar nav hover: slate-100 bg.

### 2. `/shop` — Product List (DESKTOP + MOBILE)

B2B closed marketplace product catalog. Clean, high-density grid with wholesale buyer focus.

**Layout**: Top nav bar (60px, white, border-b slate-200): logo left, shop/deposit/orders links center, 잔액 뱃지 (`₩1,234,500 보유`, sky-100 bg sky-900 text, rounded-full, JetBrains Mono), avatar right.

**Filter bar** (sticky 56px below nav, slate-50 bg): 검색 input (w-80, 좌측 Search icon), 카테고리 Select, 정렬 Select (최신순/가격낮은순/가격높은순), 결과 수 (slate-500 14px right).

**Product grid** (desktop: 4 cols, tablet: 3, mobile: 2), gap 24px:
- Card: white bg, slate-200 border, radius 8px, hover border slate-400 transition 150ms
- Aspect-square image top (next/image, object-cover), placeholder on missing
- Padding 16px: 상품명 (16px 500), 카테고리 (12px slate-500 uppercase), 가격 (18px JetBrains Mono 600, right-aligned 아래줄), stock badge (재고 <10 시 amber)
- 장바구니 추가 버튼 (full width, slate-900 bg white text, hover sky-700, 40px h) with ShoppingCart icon + "담기"

**Empty state**: center flex, PackageSearch lucide icon 48px slate-300, "조건에 맞는 상품이 없습니다" slate-600, reset button.

**Balance warning**: if 잔액 < lowest product price, sticky top banner amber-50 bg amber-900 text "잔액이 부족합니다. 이체 요청하기 →".

### 3. `/admin/orders` — Order Management (DESKTOP)

Order management console with tabs for status workflow and inline state transitions.

**Layout**: sidebar same as dashboard.

**Header area**: page title "주문 관리" (24px Lexend 600), right-side bulk actions (disabled until selection) + 전체 다운로드 ghost button.

**Tabs** (shadcn Tabs component): 전체 / 대기(placed) / 확인됨(confirmed) / 배송중(shipped) / 완료(delivered) / 취소(cancelled) — count badge per tab (e.g., "대기 12"), active tab has slate-900 underline.

**Filter row** (below tabs): 검색 (주문번호/고객명), 기간 date range, 금액 범위 slider.

**Orders table** (density-high, 44px rows):
- Columns: checkbox / 주문번호 (mono, sky-700 link) / 고객 / 상품 요약 (3 items + "외 N") / 금액 (mono right) / 상태 배지 / 주문일시 / 액션
- Status badges: placed = sky-100/sky-800 "대기", confirmed = emerald-100/emerald-800 "확인됨", shipped = violet-100/violet-800 "배송중", delivered = slate-100/slate-700 "완료", cancelled = red-100/red-800 "취소"
- Action cell: context 메뉴 (MoreHorizontal icon button 32px) with 항목 ["상세", "상태 변경", "송장 입력", "취소"]
- Row click → opens detail drawer (right-side, 480px wide)

**Detail drawer**: 주문 정보 / 상품 목록 / 배송지 / 상태 전이 스테퍼 (horizontal with sky-700 active, slate-300 future) / 송장번호 input (택배사 Select + tracking number) / 액션 버튼 (상태 진행 primary / 취소 destructive ghost).

### 4. `/login` — Login (DESKTOP + MOBILE)

Minimal centered auth card. Swiss Modernism trust aesthetic.

**Layout**: full-viewport flex center, slate-50 bg, subtle grid pattern (optional, 5% opacity).

**Card**: 400px wide, white, radius 8px, border slate-200, padding 32px.
- Logo/brand name top (Lexend 24px 600, slate-950, center)
- Subtitle "엑시트몰에 로그인" (16px slate-600, center, mb 24px)
- Email input (floating label or top label "이메일", slate-700), Mail icon prefix
- Password input, type=password, Lock icon prefix, visibility toggle Eye icon suffix
- Error slot (aria-live polite) red-600 14px inline
- "로그인" button (full width, h-11, slate-900 bg, hover sky-700)
- Divider "또는"
- "회원가입" link (sky-700, center, 14px)
- Footer 작은 텍스트 "가입은 관리자 승인 후 이용 가능합니다" slate-500 12px

---

## Tier 2 — Buyer flows

### 5. `/cart` — Cart (DESKTOP + MOBILE)

**Layout**: top nav. Main: 2-column (8 cols table + 4 cols summary sticky).

**Left — items table**: 이미지 (80x80) / 상품명 + 옵션 / 단가 (mono) / 수량 (shadcn Input number with − + buttons, 32px, min 1) / 소계 (mono) / 삭제 (X icon button). Empty: ShoppingCart 48px, "장바구니가 비어있습니다" + "쇼핑 계속하기" CTA.

**Right — summary**:
- 잔액 카드 top: "보유 예치금 ₩1,234,500" JetBrains Mono 24px
- 주문 요약: 총 상품 N개 / 상품 금액 / 배송비 (무료 또는 가격) / 총 결제 금액 (large, mono)
- 잔액 체크: 잔액 ≥ 총액 → emerald CheckCircle "결제 가능" / 부족 → red AlertCircle "잔액이 ₩N 부족합니다" + "이체 요청" ghost button
- CTA "주문하기" (full width, h-11, slate-900 → sky-700 hover, disabled if 부족)

### 6. `/checkout` — Checkout (DESKTOP + MOBILE)

2-column. Left: 배송 정보 form (수령인/연락처/주소/우편번호 with 주소 검색 modal trigger/요청사항 textarea), 결제 수단 card "예치금 결제" (only option, slate-50 bg with Wallet icon). Right: 최종 요약 (items summary, 금액, 차감 후 잔액 프리뷰 mono), "주문 확정" CTA (slate-900). Terms checkbox "약관에 동의합니다" above CTA.

### 7. `/deposit` — Deposit (DESKTOP + MOBILE)

**Hero card**: 현재 잔액 (40px Lexend Mono 600), 임계치 알림 (잔액 < 임계치 시 amber strip 상단), "이체 요청하기" primary button right.

**Tabs**: 이체 내역 (pending/approved/rejected 탭), 차감 내역 (주문별).

**Table**: 날짜 / 종류 (배지) / 금액 (+/−, emerald/red, mono right) / 잔액 (mono) / 메모.

### 8. `/deposit/new` — Transfer Request Form

Center 480px card. 금액 input (₩ prefix, mono, 큰 글씨), 입금자명, 입금 계좌 (readonly display of admin 계좌 정보, copy button), 이체 예정 일자, 메모 textarea. "요청 제출" primary. 도움말 accordion "이체 후 승인까지 영업일 1일 소요".

### 9. `/orders` — My Orders (DESKTOP + MOBILE)

Tabs: 전체 / 진행중 / 완료 / 취소. Orders as cards (not table, 주문자용 가독성 우선): 주문번호 mono + 날짜 top, 상품 미리보기 (3 thumbnails), 상태 stepper (horizontal dots), 금액, 액션 (상태 'placed'면 취소 ghost destructive, shipped면 배송 조회 ghost, delivered면 리뷰 optional).

### 10. `/signup` — Signup

Same card style as login but 480px. Fields: 회사명 / 담당자명 / 이메일 / 전화 / 비밀번호 / 비밀번호 확인 / 약관 체크. After submit: success state "가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다." with Mail icon 64px slate-400.

---

## Tier 3 — Admin detail

### 11. `/admin/approvals`

Sidebar + page. Table of pending signups: 회사명 / 담당자 / 이메일 / 가입일 / 연락처 / 액션 (Approve primary-sm + Reject ghost-destructive-sm). Row click → drawer with 전체 정보 + 메모 textarea + Approve/Reject buttons. Top stats "대기 12" "오늘 승인 3".

### 12. `/admin/deposits`

Table: 요청일시 / 사용자 / 금액 (mono) / 입금자명 / 메모 / 상태 / 액션. Bulk approve. Row click → drawer with 이체 증빙 (만약 업로드 있음) + 계좌 대조 checklist + 승인 comment + Approve/Reject.

### 13. `/admin/products`

Top: 상품 목록 "전체 156" + 검색 + 카테고리 필터 + "새 상품" primary button.
Table: checkbox / 썸네일 (48x48) / 상품명 / 카테고리 / 가격 (mono right) / 재고 (mono, red if <10) / 상태 toggle (판매중/숨김) / 액션 메뉴. 상품 추가/편집은 우측 drawer — 폼 (상품명/카테고리/가격/재고/설명 textarea/이미지 업로드 dropzone with progress).

### 14. `/admin/users`

Table: 체크 / 회사명 / 담당자 / 이메일 / 잔액 (mono right) / 상태 (active/suspended 배지) / 임계치 (inline edit mono) / 가입일 / 액션. Drawer detail: 전체 정보 + 잔액 조정 폼 (금액 + 사유 textarea, + / − 토글) + 주문 이력 미니 테이블 + 상태 변경 (active/suspended 라디오).

### 15. `/admin/low-balance`

Hero: 총 N명 잔액 부족. Table: 회사명 / 잔액 (mono) / 임계치 (mono) / 마지막 주문 / 마지막 이체 / 액션 (SMS/Email 보내기 ghost). Top filter "임계치의 X% 미만". 전체 선택 후 bulk notify.

### 16. `/admin/settings`

Single form card (600px). 섹션: 기본 계좌 정보 (은행 Select / 계좌번호 / 예금주), 기본 배송비, 잔액 기본 임계치, 시스템 공지 (textarea, 상단 배너로 노출). "저장" primary button bottom. Unsaved changes indicator (header chip "변경 사항 있음 amber").
