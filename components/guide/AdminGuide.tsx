import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'approvals', label: '가입 승인' },
  { id: 'deposits', label: '입금 확인' },
  { id: 'products', label: '상품 관리' },
  { id: 'product-import', label: '상품 엑셀 올리기' },
  { id: 'orders', label: '주문 검토' },
  { id: 'shipping-upload', label: '배송대행 검토' },
  { id: 'inbound', label: '입고 요청 처리' },
  { id: 'support', label: 'CS 문의 처리' },
  { id: 'users', label: '사용자 관리' },
  { id: 'low-balance-settings', label: '잔액 부족 / 설정' },
  { id: 'legacy', label: '예전 화면' },
  { id: 'help', label: '도움이 필요할 때' },
];

export function AdminGuide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>관리자는 <Link href="/admin">대시보드</Link>에서 일을 시작합니다. 새 검토 건이 들어오면 화면에 바로 알림이 떠요.</p>
          <p>평소 업무는 다음 순서로 도는 걸 권합니다.</p>
          <ol>
            <li>대시보드의 새 알림 확인</li>
            <li><Link href="/admin/approvals">가입 승인</Link> 처리</li>
            <li><Link href="/admin/deposits">입금 확인</Link> 처리</li>
            <li><Link href="/admin/orders">주문</Link> · <Link href="/admin/shipping-uploads/exitmall">배송대행</Link> 검토</li>
            <li><Link href="/admin/inbound-requests">입고 요청</Link> · <Link href="/admin/support-requests">CS 문의</Link> 답변</li>
          </ol>
        </GuideSection>

        <GuideSection id="approvals" title="가입 승인">
          <p><Link href="/admin/approvals">가입 승인</Link>에서 신청을 검토합니다. 승인할 때 사용자 그룹을 골라야 합니다.</p>
          <ul>
            <li><strong>group1</strong>: 엑시트몰의 모든 기능을 씁니다. 기본값.</li>
            <li><strong>group2</strong>: 배송대행만 씁니다. 상점·주문·예치금 메뉴는 보이지 않습니다.</li>
          </ul>
          <p>거절된 사용자도 다시 신청할 수 있고, 다시 신청한 사실이 화면에 표시됩니다.</p>
        </GuideSection>

        <GuideSection id="deposits" title="입금 확인">
          <p><Link href="/admin/deposits">입금 확인</Link>에서 이체 요청을 검토합니다. 실제 입금이 들어온 것을 확인하면 해당 사용자의 예치금에 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="products" title="상품 관리">
          <p><Link href="/admin/products">상품 관리</Link>에서 상품을 등록·수정·삭제하고, 1인 구매 한도와 이미지를 관리합니다. 상품을 잠시 노출에서 빼고 싶을 때는 노출 여부를 끌 수 있습니다.</p>
          <p>삭제한 상품은 사라지지 않고 <Link href="/admin/products?view=deleted">삭제됨 탭</Link>에서 다시 복구할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="product-import" title="상품 엑셀 올리기">
          <p><Link href="/admin/products/import">상품 가져오기</Link>에서 엑셀을 올리면 가격, 한도, 이미지 주소, 중복 여부를 먼저 보여 드립니다. 확인 후 적용을 누르면 등록됩니다. 새로 추가된 상품은 비공개 상태로 만들어지니, 검토 후 공개로 바꿔 주세요.</p>
        </GuideSection>

        <GuideSection id="orders" title="주문 검토">
          <p><Link href="/admin/orders">주문 관리</Link>에서 사용자가 올린 상품 구매 주문을 검토하고 승인하거나 반려합니다.</p>
          <ul>
            <li><strong>승인</strong>: 예치금이 빠지고, 전체 재고가 줄고, 사용자 재고에 그만큼 쌓이며, 변동 내역이 기록됩니다.</li>
            <li><strong>반려</strong>: 아무것도 차감하지 않고, 적은 사유가 사용자 화면에 그대로 표시됩니다.</li>
          </ul>
          <p><strong>반려 사유 작성 팁</strong>: 사용자에게 그대로 노출됩니다. &quot;재고 부족&quot;처럼 짧고 분명한 표현이 좋고, 무엇을 어떻게 고쳐 다시 요청해야 하는지가 보이면 사용자가 한 번에 처리할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="배송대행 검토">
          <p><Link href="/admin/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 사용자가 올린 배송 건을 검토합니다.</p>
          <ol>
            <li>원본 엑셀을 내려받아 행별 내용을 확인합니다.</li>
            <li>승인하면 사용자의 재고(엑시트몰 상품·직접 등록한 재고 모두)와 배송비가 빠져나갑니다.</li>
            <li>송장 번호가 적힌 엑셀을 같은 건에 다시 올리면 행마다 송장이 표시됩니다. 같은 엑셀을 다시 올려도 결과는 같으니 안심하셔도 됩니다. 일부 행만 먼저 발송하는 것도 가능합니다.</li>
            <li>모든 행의 발송이 끝나면 &quot;완료 처리&quot;로 마무리합니다.</li>
          </ol>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청 처리">
          <p><Link href="/admin/inbound-requests">입고리스트</Link>에서 사용자가 올린 글을 보고 상태(<strong>접수 / 검토 / 입고완료 / 취소</strong>)를 바꿉니다. 댓글로 답할 수 있고, 사용자가 아직 못 본 답변은 배지로 알려 드립니다.</p>
        </GuideSection>

        <GuideSection id="support" title="CS 문의 처리">
          <p><Link href="/admin/support-requests">교환/반품 및 CS 문의</Link>에서 사용자가 비공개로 올린 문의를 처리합니다.</p>
          <p>처리 단계는 <strong>접수 → 처리중 → 완료</strong> 순서이고, 필요하면 <strong>취소</strong>로 종결할 수 있어요. 단, 취소는 되돌릴 수 없으니 신중히 사용해 주세요.</p>
          <ul>
            <li><strong>접수</strong> 상태에서는 &quot;처리중으로&quot;를 눌러 작업을 시작합니다.</li>
            <li><strong>처리중</strong> 상태에서는 댓글로 답변을 주고받고, 마무리되면 &quot;완료 처리&quot;를 누릅니다.</li>
            <li><strong>완료 / 취소</strong> 상태에서는 추가 액션이 없습니다.</li>
          </ul>
          <p>목록에서는 상태 탭과 유형(교환/반품/CS문의/기타)으로 추리고, 제목·작성자·이메일로 검색할 수 있습니다. 사용자가 새 댓글을 달면 목록에 &quot;새 댓글&quot; 표시가 뜹니다.</p>
        </GuideSection>

        <GuideSection id="users" title="사용자 관리">
          <p><Link href="/admin/users">사용자 관리</Link>에서 예치금 잔액 조정, 계정 상태, <strong>잔액 부족 안내 기준</strong>, 사용자 그룹을 바꿀 수 있습니다. 잔액 부족 안내 기준은 &quot;이 금액보다 잔액이 적으면 사용자 화면에 안내 배너를 띄우는&quot; 기준선입니다. 사용자별로 직접 등록한 재고를 추가하거나 조정하는 것도 같은 화면에서 가능합니다.</p>
        </GuideSection>

        <GuideSection id="low-balance-settings" title="잔액 부족 / 설정">
          <p><Link href="/admin/low-balance">잔액 부족 고객</Link>에서 안내가 필요한 사용자 목록을 볼 수 있습니다.</p>
          <p><Link href="/admin/settings">설정</Link>에서 입금받을 계좌 정보를 관리합니다.</p>
        </GuideSection>

        <GuideSection id="legacy" title="예전 화면">
          <p><Link href="/admin/orders-legacy">구 일반 주문</Link>과 <Link href="/admin/order-uploads">구 배송대행 업로드</Link>는 기록 확인용입니다. 새로 작업할 때는 사용하지 않습니다.</p>
        </GuideSection>

        <GuideSection id="help" title="도움이 필요할 때">
          <p>이 가이드에서 답을 찾지 못했다면 <Link href="/admin/guide/faq">자주 묻는 질문</Link>을 확인해 보세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
