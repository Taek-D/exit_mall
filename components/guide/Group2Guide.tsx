import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'shipping-upload', label: '사입재고 배송대행' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'account', label: '계정' },
];

export function Group2Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>2그룹 사용자는 사입재고 배송대행과 입고 요청만 사용할 수 있습니다. 엑시트몰 상점, 일반 보유 재고, 예치금 관리 메뉴는 노출되지 않습니다.</p>
          <p>가입 신청 후 관리자의 승인이 완료되면 메뉴가 활성화됩니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="사입재고 배송대행">
          <p><strong>현재 준비 중입니다.</strong> 출시되면 직접 사입하신 재고를 엑시트몰을 통해 배송대행할 수 있게 됩니다.</p>
          <p>예상 흐름:</p>
          <ol>
            <li><Link href="/shipping-uploads/purchased">사입재고 배송대행</Link>에서 양식 엑셀을 다운로드합니다.</li>
            <li>받는사람 명단과 본인 사입 상품 정보를 작성합니다.</li>
            <li>업로드 → 검토 요청 → 관리자 승인 → 송장 노출 순으로 진행됩니다.</li>
          </ol>
          <p>상세한 사용 방법은 출시 시점에 가이드에 추가됩니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>사입 상품을 엑시트몰 창고로 보낼 때 <Link href="/inbound-requests">입고리스트</Link>에 비공개 게시글을 등록합니다. 엑셀 양식을 첨부하고 댓글로 관리자와 진행 상황을 주고받을 수 있습니다.</p>
          <p>상태는 접수 → 검토 → 입고완료 순으로 진행됩니다. 검토 전 상태에서는 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <p><Link href="/account/password">비밀번호 변경</Link>은 계정 메뉴에서 할 수 있습니다.</p>
          <p>아이디를 잊었다면 <Link href="/find-account">아이디 찾기</Link>, 비밀번호를 잊었다면 <Link href="/find-account">비밀번호 재설정</Link>을 이용해주세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
