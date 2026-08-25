'use client';
import { useToast } from '@/hooks/use-toast';

/**
 * 송장번호 자체를 눌러 복사한다.
 *
 * 별도 복사 아이콘을 행마다 두면 한 요청에 최대 23행까지 아이콘이 깔리고,
 * hover로만 띄우면 hover가 없는 모바일에서 기능이 사라진다. 숫자 자체를
 * 버튼으로 두면 아이콘이 늘지 않으면서 터치에서도 동작한다. hover 스타일은
 * 기능이 아니라 "누를 수 있다"는 힌트로만 쓴다.
 */
export function TrackingNumberCopy({ value }: { value: string }) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${value} 복사했습니다` });
    } catch {
      toast({ title: '복사할 수 없습니다.', variant: 'destructive' });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="클릭하면 복사"
      aria-label={`송장번호 ${value} 복사`}
      className="-mx-1.5 -my-0.5 rounded px-1.5 py-0.5 font-mono tabular transition-colors hover:bg-accent/10 hover:text-accent hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
    >
      {value}
    </button>
  );
}
