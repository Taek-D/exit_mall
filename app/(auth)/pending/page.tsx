import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export default function PendingPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status ?? 'pending';
  const title = status === 'suspended' ? '계정이 정지되었습니다' : '관리자 승인 대기 중';
  const body = status === 'suspended'
    ? '운영자에게 문의해주세요.'
    : '가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.';
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>{body}</p>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="w-full">로그아웃</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
