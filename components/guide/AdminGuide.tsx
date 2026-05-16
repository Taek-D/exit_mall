import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'approvals', label: '가입 승인' },
  { id: 'deposits', label: '입금 확인' },
  { id: 'products', label: '상품 관리' },
  { id: 'product-import', label: '상품 엑셀 가져오기' },
  { id: 'orders', label: '주문 관리' },
  { id: 'shipping-upload', label: '배송대행 관리' },
  { id: 'inbound', label: '입고 요청 관리' },
  { id: 'users', label: '사용자 관리' },
  { id: 'low-balance-settings', label: '잔액 부족 / 설정' },
  { id: 'legacy', label: 'Legacy 화면' },
];

export function AdminGuide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>관리자는 <Link href="/admin">대시보드</Link>에서 신규 검토대기 토스트(Realtime) 알림을 받습니다. 일상 업무는 가입 승인 → 입금 확인 → 주문/배송대행 검토 흐름으로 진행됩니다.</p>
        </GuideSection>

        <GuideSection id="approvals" title="가입 승인">
          <p><Link href="/admin/approvals">가입 승인</Link>에서 신청 목록을 검토합니다. 승인 시 사용자 그룹(group1 / group2)을 선택해야 합니다.</p>
          <ul>
            <li><strong>group1</strong>: 엑시트몰 전체 기능 사용. 기본 선택.</li>
            <li><strong>group2</strong>: 배송대행 전용. 상점/주문/예치금 등 차단.</li>
          </ul>
          <p>거절된 사용자는 다시 신청할 수 있고 재신청 사실이 화면에 표시됩니다.</p>
        </GuideSection>

        <GuideSection id="deposits" title="입금 확인">
          <p><Link href="/admin/deposits">입금 확인</Link>에서 이체 요청을 검토하고, 실제 입금을 확인하면 고객의 예치금에 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="products" title="상품 관리">
          <p><Link href="/admin/products">상품 관리</Link>에서 상품 CRUD, 1인 한도 설정, 이미지 업로드, 비활성 토글, 소프트 삭제를 처리합니다.</p>
          <p>삭제된 상품은 <Link href="/admin/products?view=deleted">삭제됨 탭</Link>에서 복구할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="product-import" title="상품 엑셀 가져오기">
          <p><Link href="/admin/products/import">상품 가져오기</Link>에서 엑셀을 업로드 → 미리보기로 검증(가격/한도/이미지 URL/중복) → 적용 순으로 진행합니다. 신규 상품은 비공개 상태로 생성됩니다.</p>
        </GuideSection>

        <GuideSection id="orders" title="주문 관리 (상품 구매 / stock_orders)">
          <p><Link href="/admin/orders">주문 관리</Link>에서 흐름 1(상품 구매) 검토대기 주문을 검토하고 승인/반려합니다.</p>
          <p>승인 시: 예치금 차감 + 마스터 재고 차감 + 사용자 보유 재고 적립 + 변동 내역 기록.</p>
          <p>반려 시: 차감 없이 사유와 함께 반려 처리되고, 주문자 화면에 사유가 노출됩니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="배송대행 관리">
          <p><Link href="/admin/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 검토대기 업로드를 검토합니다.</p>
          <ol>
            <li>원본 다운로드로 행별 내용을 확인합니다.</li>
            <li>승인 시 보유 재고가 차감(엑시트몰/수기 모두 포함)되고 배송비가 차감됩니다.</li>
            <li>송장을 채운 엑셀을 같은 업로드에 재업로드하면 행별 송장이 반영됩니다(멱등). 부분 발송도 가능합니다.</li>
            <li>모든 행이 발송되면 &quot;완료 처리&quot;로 마무리합니다.</li>
          </ol>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청 관리">
          <p><Link href="/admin/inbound-requests">입고리스트</Link>에서 사용자 게시글을 검토하고 상태(접수/검토/입고완료/취소)를 변경합니다. 댓글로 응답할 수 있으며 미확인 답변은 배지로 표시됩니다.</p>
        </GuideSection>

        <GuideSection id="users" title="사용자 관리">
          <p><Link href="/admin/users">사용자 관리</Link>에서 잔액 조정, 상태, 임계치, 사용자 그룹 변경을 처리합니다. 사용자별 수기 재고 등록·조정도 같은 화면에서 가능합니다.</p>
        </GuideSection>

        <GuideSection id="low-balance-settings" title="잔액 부족 / 설정">
          <p><Link href="/admin/low-balance">잔액 부족 고객</Link>에서 알림 대상 목록을 확인할 수 있습니다.</p>
          <p><Link href="/admin/settings">설정</Link>에서 입금 계좌 정보를 관리합니다.</p>
        </GuideSection>

        <GuideSection id="legacy" title="Legacy 화면">
          <p><Link href="/admin/orders-legacy">구 일반 주문</Link>과 <Link href="/admin/order-uploads">구 배송대행 업로드</Link>는 열람 전용입니다. 신규 흐름에서는 사용하지 않습니다.</p>
        </GuideSection>
      </main>
    </div>
  );
}
