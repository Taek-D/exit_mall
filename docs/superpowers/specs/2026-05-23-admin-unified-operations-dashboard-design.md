# 관리자 통합 운영 대시보드 설계

## 배경

현재 `/admin` 대시보드는 legacy `orders` 중심으로 최근 주문과 일부 운영 카운트를 보여준다. 실제 운영 흐름은 `stock_orders`, `order_uploads`, 입고리스트, CS 문의, 예치금 승인, 가입 승인으로 분산되어 있다. `OrdersRealtime`는 새 흐름의 이벤트를 구독하지만, 홈 화면 요약은 아직 이 흐름을 통합하지 못한다.

관리자 홈은 개별 업무를 처리하는 화면이 아니라, 지금 처리해야 할 업무량을 빠르게 확인하고 해당 필터 화면으로 이동하는 운영 허브가 되어야 한다.

## 목표

- 관리자 홈에서 핵심 업무 큐의 현재 대기 총량을 한눈에 확인한다.
- 각 큐의 "검토대기 N건" 또는 대기 카드를 클릭하면 기존 필터 화면으로 이동한다.
- 최근 활동은 legacy 주문 대신 가입, 입금, 구매 승인, 배송대행, 입고리스트, CS 문의를 통합해 최신순으로 보여준다.
- 홈에서는 승인/반려 같은 처리 액션을 직접 수행하지 않고 상세 또는 목록 화면으로 이동한다.
- 화면 코드는 얇게 유지하고, 집계 규칙은 서버 전용 헬퍼로 분리한다.

## 제외 범위

- 홈에서 가입 승인, 입금 확인, 구매 승인, 배송대행 승인, CS 답변을 바로 처리하는 기능.
- 새 데이터베이스 view 또는 RPC 생성.
- 기존 상세/목록 페이지의 승인 로직 변경.
- legacy 주문 관리 기능 제거. 단, 관리자 홈의 최근 활동에서는 legacy `orders`를 제외한다.

## 접근 방식

`/admin` 홈은 렌더링에 집중하고, 새 서버 전용 헬퍼 `lib/admin/dashboard.ts`가 대시보드 데이터를 조립한다.

헬퍼는 Supabase 서버 클라이언트를 사용해 여러 도메인의 카운트와 최근 항목을 조회한다. 결과는 UI에서 바로 사용할 수 있는 정규화된 구조로 반환한다.

이 방식은 `/admin/page.tsx`에 여러 도메인의 쿼리와 정규화 로직이 쌓이는 것을 막고, 카운트 기준과 최근 활동 정렬을 단위 테스트하기 쉽게 만든다.

## 데이터 모델

`lib/admin/dashboard.ts`는 다음 타입을 제공한다.

```ts
export type AdminWorkQueue = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: 'default' | 'warning' | 'danger';
  icon: AdminDashboardIconKey;
  secondaryCount?: number;
  secondaryLabel?: string;
};

export type AdminRecentActivity = {
  id: string;
  type: string;
  title: string;
  customerName: string | null;
  statusLabel: string;
  occurredAt: string;
  href: string;
};

export type AdminDashboardData = {
  totalPendingCount: number;
  unreadAttentionCount: number;
  workQueues: AdminWorkQueue[];
  recentActivities: AdminRecentActivity[];
};
```

`AdminDashboardIconKey`는 UI에서 lucide 아이콘으로 매핑한다. 서버 헬퍼가 직접 컴포넌트를 반환하지 않게 해 데이터와 렌더링 경계를 분리한다.

## 업무 큐 기준

업무 큐는 고정 순서로 표시한다.

| 업무 | 카운트 기준 | 이동 링크 |
| --- | --- | --- |
| 가입 승인 | `profiles.status = 'pending'` | `/admin/approvals` |
| 입금 확인 | `deposit_requests.status = 'pending'` | `/admin/deposits` |
| 구매 승인 | `stock_orders.status = 'pending'` | `/admin/orders?status=pending` |
| 엑시트몰 배송대행 | `order_uploads.upload_type = 'exitmall'` and `status = 'pending'` | `/admin/shipping-uploads/exitmall?status=pending` |
| 사입재고 배송대행 | `order_uploads.upload_type = 'purchased'` and `status = 'pending'` | `/admin/shipping-uploads/purchased?status=pending` |
| 입고리스트 | `inbound_requests.status = 'open'` | `/admin/inbound-requests?status=open` |
| CS 문의 | `support_requests.status = 'open'` | `/admin/support-requests?status=open` |

입고리스트와 CS 문의는 `open`을 주 카운트로 사용한다. 관리자가 이미 잡고 있는 `in_progress`는 처리 중인 업무이므로 홈의 기본 대기 숫자에는 포함하지 않는다. 다만 사용자가 새 댓글을 남겨 관리자가 아직 읽지 않은 항목 수는 `secondaryCount`와 `secondaryLabel`로 보조 표시한다.

모든 큐는 `count > 0` 또는 `secondaryCount > 0`이면 `warning` 톤을 사용한다. 예치금 부족처럼 즉시 위험으로 분류하는 별도 큐는 이번 범위에 포함하지 않는다.

## 최근 활동 기준

최근 활동은 도메인별로 소량을 조회한 뒤 앱에서 하나의 배열로 합쳐 최신순으로 정렬한다. 홈에는 상위 15건만 표시한다.

기준 시간은 다음과 같다.

- 가입 승인: `profiles.created_at`
- 입금 확인: `deposit_requests.created_at`
- 구매 승인: `stock_orders.created_at`
- 엑시트몰 배송대행: `order_uploads.created_at`
- 사입재고 배송대행: `order_uploads.created_at`
- 입고리스트: `last_comment_at ?? updated_at ?? created_at`
- CS 문의: `last_comment_at ?? updated_at ?? created_at`

각 활동은 상세 또는 해당 항목을 확인할 수 있는 페이지로 이동한다. 상세 페이지가 있는 도메인은 상세 링크를 사용하고, 승인 전용 목록만 있는 가입/입금은 목록 링크를 사용한다.

## UI 구성

`/admin/page.tsx`는 다음 순서로 구성한다.

1. `OrdersRealtime`
2. 제목과 운영 요약
3. "오늘 처리할 일" 업무 큐 카드 그리드
4. "최근 업무 이벤트" 통합 테이블
5. 핵심 운영 라우트 중심의 빠른 이동 목록

업무 큐 카드는 기존 `StatCard` 스타일을 기반으로 보조 카운트를 표시할 수 있게 확장한다. 카드에는 업무명, 대기 건수, 설명, 보조 카운트가 표시된다. 클릭하면 `href`로 이동한다.

최근 업무 이벤트 테이블은 업무 유형, 제목, 고객, 상태, 시간, 이동 버튼을 포함한다. legacy `orders` 기반 최근 주문 테이블은 제거한다.

빠른 이동 목록에서는 legacy 주문을 제외하고 다음 핵심 라우트를 우선 제공한다.

- 가입 승인
- 입금 확인
- 구매 승인
- 엑시트몰 배송대행
- 사입재고 배송대행
- 입고리스트
- CS 문의

## 오류 처리

대시보드의 일부 도메인 조회가 실패해도 전체 홈을 깨지 않는다.

- 실패한 도메인의 카운트는 0으로 처리한다.
- 실패한 도메인의 최근 활동은 빈 배열로 처리한다.
- 서버 콘솔에 도메인명과 에러를 기록한다.

이 정책은 운영자가 홈 전체를 잃는 것보다, 가능한 나머지 업무 큐를 계속 보는 것이 낫다는 판단에 따른다.

## 테스트

단위 테스트는 `lib/admin/dashboard.ts`의 순수 정규화 로직을 중심으로 작성한다.

- 업무 큐가 고정 순서로 생성되는지 확인한다.
- 각 업무 큐의 카운트 기준과 필터 링크가 일치하는지 확인한다.
- `count > 0`일 때 warning 톤이 적용되는지 확인한다.
- 입고리스트와 CS 문의의 미확인 댓글 수가 보조 카운트로 표시되는지 확인한다.
- 여러 도메인의 최근 활동이 `occurredAt` 기준 최신순으로 정렬되는지 확인한다.
- 최근 활동이 지정된 최대 개수로 잘리는지 확인한다.

수동 검증은 `/admin`에서 각 업무 큐 카드를 눌러 기존 필터 화면으로 이동하는지 확인한다.

## 구현 메모

- 기존 `fetchAdminStockOrders`, `fetchAdminShippingUploads`, `fetchAllInboundRequests`, `fetchAllSupportRequests`를 그대로 재사용하기보다 대시보드용 경량 select/count 쿼리를 별도로 작성한다. 홈은 전체 목록 데이터가 아니라 카운트와 최근 소량만 필요하다.
- `OrdersRealtime`는 현재 `stock_orders`, `order_uploads`만 구독한다. 통합 대시보드 구현에서는 `profiles`, `deposit_requests`, `inbound_requests`, `support_requests` 구독도 추가해 홈 요약이 같은 방식으로 갱신되게 한다.
- `/admin/page.tsx`의 깨진 한글 문자열은 새 UI 작성 과정에서 정상 한글 문구로 교체한다.
- 기존 `low-balance` 카드는 이번 통합 운영 큐의 핵심 흐름에서 제외하되, 빠른 이동이나 별도 운영 지표로 재도입할 수 있다.
