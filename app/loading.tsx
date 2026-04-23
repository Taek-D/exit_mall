import { Loader2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="text-sm">불러오는 중…</span>
      </div>
    </div>
  );
}
