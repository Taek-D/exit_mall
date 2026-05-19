import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'shipping-upload', label: '사입재고 배송대행' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'support', label: '교환·반품 / 문의' },
  { id: 'account', label: '계정' },
  { id: 'help', label: '도움이 필요할 때' },
];

export function Group2Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>이 가이드는 배송대행과 입고 요청만 이용하는 회원용입니다.</p>
          <ul>
            <li>이용 가능 메뉴: 배송대행, 입고 요청, 교환·반품/문의</li>
            <li>보이지 않는 메뉴: 상점, 일반 재고, 예치금 관리</li>
            <li>가입 신청 후 관리자가 승인하면 메뉴가 열립니다.</li>
          </ul>
        </GuideSection>

        <GuideSection id="shipping-upload" title="사입재고 배송대행">
          <p><strong>현재 준비 중입니다.</strong> 오픈되면 직접 사 두신 상품을 엑시트몰을 통해 배송으로 내보낼 수 있습니다.</p>
          <p>예상 흐름:</p>
          <ol>
            <li><Link href="/shipping-uploads/purchased">사입재고 배송대행</Link>에서 양식 엑셀을 내려받습니다.</li>
            <li>받는 사람 명단과 직접 사 두신 상품 정보를 적습니다.</li>
            <li>엑셀 올리기 → 검토 요청 → 관리자 승인 → 송장 표시 순으로 진행됩니다.</li>
          </ol>
          <p>자세한 사용 방법은 오픈 시점에 가이드에 추가됩니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>직접 사 둔 상품을 엑시트몰 창고로 보낼 때 사용합니다.</p>
          <ul>
            <li><Link href="/inbound-requests">입고리스트</Link>에 비공개 글을 올립니다.</li>
            <li>엑셀 양식을 첨부합니다.</li>
            <li>진행 상황은 댓글로 관리자와 주고받습니다.</li>
          </ul>
          <p>처리 단계: <strong>접수 → 검토 → 입고완료</strong></p>
          <ul>
            <li>아직 검토에 들어가기 전이라면 직접 취소할 수 있습니다.</li>
          </ul>
        </GuideSection>

        <GuideSection id="support" title="교환·반품 / 문의">
          <p>배송이나 입고에 문제가 있거나 따로 물어볼 게 있을 때 <Link href="/support-requests">교환/반품 및 CS 문의</Link>에서 비공개로 글을 남깁니다. 관리자만 볼 수 있고, 답변은 댓글로 받습니다.</p>
          <p>새 글을 쓸 때 고를 수 있는 <strong>문의 유형</strong>:</p>
          <ul>
            <li><strong>교환</strong>: 받은 상품을 다른 상품으로 바꾸고 싶을 때</li>
            <li><strong>반품</strong>: 받은 상품을 돌려보내고 싶을 때</li>
            <li><strong>CS문의</strong>: 배송 지연, 오배송 등 일반 문의</li>
            <li><strong>기타</strong>: 위에 해당하지 않는 경우</li>
          </ul>
          <p>입력 항목:</p>
          <ul>
            <li><strong>참고 번호</strong>: 관련 주문번호나 운송장번호가 있다면 적어 주세요. 관리자가 더 빨리 처리할 수 있습니다.</li>
            <li><strong>첨부파일</strong>: 사진, PDF, 엑셀 등. 최대 5개, 각 10MB까지.</li>
          </ul>
          <p>처리 단계: <strong>접수 → 처리중 → 완료</strong></p>
          <ul>
            <li>관리자가 새 답변을 남기면 목록에 &quot;새 답변&quot; 표시가 뜹니다.</li>
            <li>아직 처리에 들어가기 전이라면 직접 취소할 수 있습니다.</li>
          </ul>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <ul>
            <li><strong>비밀번호 변경</strong>: <Link href="/account/password">비밀번호 변경</Link>에서 바꿀 수 있습니다.</li>
            <li><strong>아이디를 잊었을 때</strong>: <Link href="/find-account">아이디 찾기</Link></li>
            <li><strong>비밀번호를 잊었을 때</strong>: <Link href="/find-account">비밀번호 재설정</Link></li>
          </ul>
        </GuideSection>

        <GuideSection id="help" title="도움이 필요할 때">
          <ol>
            <li>먼저 <Link href="/guide/faq">자주 묻는 질문</Link>을 확인해 보세요.</li>
            <li>그래도 해결되지 않으면 관리자에게 직접 문의해 주세요.</li>
          </ol>
        </GuideSection>
      </main>
    </div>
  );
}
