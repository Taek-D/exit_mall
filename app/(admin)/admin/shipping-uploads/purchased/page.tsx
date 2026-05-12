import { ComingSoon } from '@/components/ComingSoon';

export default function AdminPurchasedShippingPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">사입재고 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          외부 매입 재고 발송 의뢰 흐름. 현재 준비 중입니다.
        </p>
      </header>
      <ComingSoon
        title="사입재고 배송대행"
        description="사입재고 등록·검토 흐름이 준비되면 이 메뉴에서 관리할 수 있습니다."
      />
    </div>
  );
}
