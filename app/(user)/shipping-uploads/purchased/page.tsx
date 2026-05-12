import { ComingSoon } from '@/components/ComingSoon';

export default function PurchasedShippingPage() {
  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">사입재고 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          외부에서 매입한 사입재고를 발송 의뢰하는 메뉴입니다.
        </p>
      </header>
      <ComingSoon
        title="사입재고 배송대행"
        description="사입재고 등록·발송 흐름을 준비하고 있습니다. 오픈 시점에 다시 안내드립니다."
      />
    </div>
  );
}
