import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'purchase', label: '1. 상품 사기' },
  { id: 'shipping-upload', label: '2. 배송 보내기' },
  { id: 'inventory', label: '내 재고 보기' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'support', label: '교환·반품 / 문의' },
  { id: 'deposit', label: '예치금' },
  { id: 'account', label: '계정' },
  { id: 'troubleshooting', label: '자주 막히는 상황' },
  { id: 'help', label: '도움이 필요할 때' },
];

export function Group1Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>엑시트몰은 회원 승인 후 이용할 수 있는 거래 사이트입니다. 가입 신청을 하면 관리자가 확인한 뒤 이용이 열립니다.</p>
          <p>모든 결제는 미리 충전해 둔 <strong>예치금</strong>으로 진행됩니다. 가장 먼저 <Link href="/deposit/new">예치금 충전 요청</Link>을 등록하고, 안내된 계좌로 송금해 주세요. 관리자가 입금을 확인하면 잔액에 바로 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="purchase" title="1. 상품 사기">
          <p>상점에서 상품을 골라 내 재고로 쌓아두는 단계입니다. 이 단계에서는 아직 배송이 나가지 않습니다.</p>
          <ol>
            <li><Link href="/shop">상점</Link>에서 원하는 상품을 장바구니에 담습니다.</li>
            <li><Link href="/cart">장바구니</Link>에서 수량을 한 번 더 확인합니다.</li>
            <li><Link href="/checkout">검토 요청</Link> 페이지에서 &quot;검토 요청&quot;을 누르면 주문이 접수됩니다. 이때 예치금은 바로 빠져나가지 않고, 승인 전까지 해당 금액만 잠시 묶어 둡니다.</li>
            <li>관리자가 승인하면 예치금이 차감되고, 산 만큼 <Link href="/inventory">내 재고</Link>에 쌓입니다.</li>
          </ol>
          <p><strong>한 사람당 살 수 있는 수량</strong>은 상품마다 정해져 있습니다. 아직 승인 전인 수량도 한도에 포함됩니다. 한도에 걸려서 더 못 담는다면, <Link href="/orders">내 주문 내역</Link>에서 검토대기 중인 주문을 일부 취소하면 다시 담을 수 있어요.</p>
          <p>승인 전(검토대기) 주문은 <Link href="/orders">내 주문 내역</Link>에서 직접 취소할 수 있습니다. 관리자가 반려한 경우에는 같은 화면에서 사유를 확인하고, 필요하면 수정해서 다시 요청하시면 됩니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="2. 배송 보내기">
          <p>내 재고를 실제로 받는 사람에게 보내는 단계입니다.</p>
          <ol>
            <li><Link href="/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 양식 엑셀을 내려받습니다.</li>
            <li>받는 사람 명단을 적습니다. <strong>한 줄에 한 명씩</strong> 작성해 주세요.</li>
            <li>엑셀을 올리면 행마다 상품이 잘 맞춰졌는지, 오류가 없는지 미리 보여 드립니다.</li>
            <li>&quot;검토 요청&quot;을 누르면 보낼 상품과 배송비가 승인 전까지 잠시 묶입니다.</li>
            <li>관리자가 승인하면 내 재고에서 그만큼 빠지고 배송비도 차감됩니다.</li>
            <li>관리자가 송장 번호가 적힌 엑셀을 다시 올리면 행마다 송장이 표시되고, CJ 조회 버튼이 생깁니다.</li>
            <li>모든 발송이 끝나면 완료 처리되어 마무리됩니다.</li>
          </ol>
          <p>엑셀에 적는 상품명은 엑시트몰 상품명이나 직접 등록한 재고 이름과 정확히 같아야 인식됩니다. <strong>띄어쓰기, 괄호, 단위 표기</strong>(예: &quot;1팩&quot; vs &quot;1 팩&quot;)가 한 글자라도 다르면 매칭되지 않아요. 미리보기에서 빨갛게 표시된 행은 상품명을 그대로 복사해서 다시 적어 보세요.</p>
          <p>반려된 경우 <Link href="/shipping-uploads/exitmall">배송대행 목록</Link>에서 사유를 확인할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="inventory" title="내 재고 보기">
          <p><Link href="/inventory">내 재고</Link>에는 상점에서 산 상품과 직접 등록해 둔 재고가 한 곳에 모여 표시됩니다.</p>
          <ul>
            <li><strong>가용</strong>: 지금 바로 배송에 쓸 수 있는 수량</li>
            <li><strong>예약</strong>: 승인 전인 배송 건에 묶여 있는 수량</li>
            <li><strong>총보유</strong>: 가용 + 예약을 합친 수량</li>
          </ul>
          <p>각 항목을 누르면 언제 늘었고 언제 빠져나갔는지 변동 내역을 볼 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>직접 사 둔 상품을 엑시트몰 창고로 보낼 때 사용합니다. <Link href="/inbound-requests">입고리스트</Link>에 비공개 글을 올리고, 엑셀 양식을 첨부하면 됩니다. 진행 상황은 댓글로 관리자와 주고받습니다.</p>
          <p>처리 단계는 <strong>접수 → 검토 → 입고완료</strong> 순서입니다. 아직 검토에 들어가기 전이라면 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="support" title="교환·반품 / 문의">
          <p>주문이나 배송에 문제가 있거나 따로 물어볼 게 있을 때 사용합니다. <Link href="/support-requests">교환/반품 및 CS 문의</Link>에서 비공개로 글을 남기면 관리자만 볼 수 있고, 답변은 댓글로 받습니다.</p>
          <p>새 글을 쓸 때 <strong>문의 유형</strong>을 골라 주세요.</p>
          <ul>
            <li><strong>교환</strong>: 받은 상품을 다른 상품으로 바꾸고 싶을 때</li>
            <li><strong>반품</strong>: 받은 상품을 돌려보내고 싶을 때</li>
            <li><strong>CS문의</strong>: 배송 지연, 오배송 등 일반 문의</li>
            <li><strong>기타</strong>: 위에 해당하지 않는 경우</li>
          </ul>
          <p>관련된 주문번호나 운송장번호가 있다면 <strong>참고 번호</strong>에 적어 주시면 관리자가 더 빨리 처리할 수 있어요. 사진, PDF, 엑셀 등 첨부파일은 최대 5개, 각 10MB까지 올릴 수 있습니다.</p>
          <p>처리 단계는 <strong>접수 → 처리중 → 완료</strong> 순서이고, 관리자가 새 답변을 남기면 목록에 &quot;새 답변&quot; 표시가 뜹니다. 아직 처리에 들어가기 전이라면 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="deposit" title="예치금">
          <p><Link href="/deposit">예치금</Link>에서 잔액과 이체 내역을 볼 수 있습니다. 충전이 필요하면 <Link href="/deposit/new">이체 요청</Link>을 등록하고 안내된 계좌로 송금해 주세요.</p>
          <p>잔액은 두 가지로 나눠 보여 드립니다.</p>
          <ul>
            <li><strong>가용</strong>: 지금 쓸 수 있는 금액</li>
            <li><strong>검토대기 예약</strong>: 승인 전인 주문이나 배송 건에 잠시 묶여 있는 금액</li>
          </ul>
          <p>승인이 끝나면 묶여 있던 금액이 실제로 빠져나갑니다.</p>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <p>비밀번호는 <Link href="/account/password">비밀번호 변경</Link>에서 바꿀 수 있습니다.</p>
          <p>아이디가 기억나지 않으면 <Link href="/find-account">아이디 찾기</Link>, 비밀번호가 기억나지 않으면 <Link href="/find-account">비밀번호 재설정</Link>을 이용해 주세요.</p>
        </GuideSection>

        <GuideSection id="troubleshooting" title="자주 막히는 상황">
          <ul>
            <li><strong>주문이 반려됐어요</strong> — <Link href="/orders">내 주문 내역</Link>에서 사유를 확인하고, 수정이 필요하면 다시 검토 요청을 등록하세요. 예치금은 차감되지 않은 상태입니다.</li>
            <li><strong>배송이 반려됐어요</strong> — <Link href="/shipping-uploads/exitmall">배송대행 목록</Link>에서 사유를 확인하고 엑셀을 고쳐 다시 올려 주세요.</li>
            <li><strong>1인 한도에 걸려요</strong> — 검토대기 중인 주문도 한도에 포함됩니다. 일부 주문을 취소하면 다시 담을 수 있어요.</li>
            <li><strong>엑셀 미리보기에 빨간 줄이 떠요</strong> — 상품명이 정확히 일치하지 않거나 수량이 비어 있을 가능성이 큽니다. 상품명을 그대로 복사해 다시 적어 보세요.</li>
            <li><strong>예치금이 모자라요</strong> — 검토대기 예약 분이 잔액을 묶고 있을 수 있어요. <Link href="/deposit">예치금</Link>에서 가용 잔액을 확인하고 부족하면 <Link href="/deposit/new">충전 요청</Link>을 등록해 주세요.</li>
          </ul>
        </GuideSection>

        <GuideSection id="help" title="도움이 필요할 때">
          <p>이 가이드에서 답을 찾지 못했다면 <Link href="/guide/faq">자주 묻는 질문</Link>을 확인해 보세요. 그래도 해결되지 않으면 관리자에게 직접 문의해 주세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
