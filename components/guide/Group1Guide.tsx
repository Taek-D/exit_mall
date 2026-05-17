import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'purchase', label: '흐름 1: 상품 구매' },
  { id: 'shipping-upload', label: '흐름 2: 배송대행' },
  { id: 'inventory', label: '보유 재고' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'deposit', label: '예치금' },
  { id: 'account', label: '계정' },
];

export function Group1Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>엑시트몰은 예치금 기반의 폐쇄몰입니다. 가입 신청 후 관리자의 승인을 받으면 사용할 수 있습니다.</p>
          <p>가장 먼저 <Link href="/deposit/new">예치금 충전 요청</Link>을 해주세요. 관리자가 입금을 확인하면 잔액에 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="purchase" title="흐름 1: 상품 구매 (재고 적립)">
          <ol>
            <li><Link href="/shop">상점</Link>에서 상품을 장바구니에 담습니다.</li>
            <li><Link href="/cart">장바구니</Link>에서 수량을 확인합니다.</li>
            <li><Link href="/checkout">검토 요청</Link> 페이지에서 &quot;검토 요청&quot; 버튼을 누르면 주문이 생성됩니다. 이 단계에서는 예치금이 차감되지 않고 가용 잔액에서 예약(보류)만 됩니다.</li>
            <li>관리자가 승인하면 예치금이 차감되고 상품이 <Link href="/inventory">보유 재고</Link>에 적립됩니다. 이 단계에서는 발송이 일어나지 않습니다.</li>
          </ol>
          <p><strong>1인 누적 구매 한도</strong>: 상품별로 1인이 구매할 수 있는 한도가 있으며, 검토대기 중인 수량도 합산됩니다.</p>
          <p>주문은 검토대기 상태에서 <Link href="/orders">내 주문 내역</Link>에서 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="흐름 2: 배송대행 (재고 발송)">
          <ol>
            <li><Link href="/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 양식 엑셀을 다운로드합니다.</li>
            <li>받는사람 명단을 1행 1택배 양식으로 작성합니다.</li>
            <li>업로드 → 행별 미리보기에서 상품명 매칭과 검증 결과를 확인합니다.</li>
            <li>&quot;검토 요청&quot;을 누르면 보유 재고와 배송비가 예약 상태로 들어갑니다.</li>
            <li>관리자가 승인하면 보유 재고가 차감되고 배송비가 차감됩니다.</li>
            <li>관리자가 송장을 채운 엑셀을 재업로드하면 행별 송장이 노출되고 CJ 조회 버튼이 활성화됩니다.</li>
            <li>완료 처리되면 마무리됩니다.</li>
          </ol>
          <p>각 행의 상품명은 엑시트몰 상품 또는 본인이 등록한 수기 재고와 정확히 일치해야 매칭됩니다.</p>
        </GuideSection>

        <GuideSection id="inventory" title="보유 재고">
          <p><Link href="/inventory">보유 재고</Link>에는 엑시트몰 상품에서 적립된 수량과 사용자가 직접 등록한 수기 재고가 통합 표시됩니다.</p>
          <ul>
            <li><strong>가용</strong>: 지금 배송대행에 쓸 수 있는 수량</li>
            <li><strong>예약</strong>: 검토대기 중인 배송대행에 묶여 있는 수량</li>
            <li><strong>총보유</strong>: 가용 + 예약</li>
          </ul>
          <p>각 항목을 클릭하면 변동 내역(타임라인)을 확인할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>사입 상품을 엑시트몰 창고로 보낼 때 <Link href="/inbound-requests">입고리스트</Link>에 비공개 게시글을 등록합니다. 엑셀 양식을 첨부하고 댓글로 관리자와 진행 상황을 주고받을 수 있습니다.</p>
          <p>상태는 접수 → 검토 → 입고완료 순으로 진행됩니다. 검토 전 상태에서는 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="deposit" title="예치금">
          <p><Link href="/deposit">예치금</Link>에서 잔액과 이체 내역을 확인할 수 있습니다. 충전이 필요하면 <Link href="/deposit/new">이체 요청</Link>을 등록하고 안내된 계좌로 송금해주세요.</p>
          <p>잔액은 <strong>가용</strong>과 <strong>검토대기 예약</strong>으로 분리되어 표시됩니다. 검토대기 중인 주문/배송대행이 승인되면 예약 분이 실제 차감됩니다.</p>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <p><Link href="/account/password">비밀번호 변경</Link>은 계정 메뉴에서 할 수 있습니다.</p>
          <p>아이디를 잊었다면 <Link href="/find-account">아이디 찾기</Link>, 비밀번호를 잊었다면 <Link href="/reset-password">비밀번호 재설정</Link>을 이용해주세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
