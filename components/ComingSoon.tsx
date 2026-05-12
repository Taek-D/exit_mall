import { Construction } from 'lucide-react';

type ComingSoonProps = {
  title: string;
  description?: string;
};

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
        <Construction className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-heading font-semibold text-lg">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      <p className="text-xs text-muted-foreground mt-2">현재 준비 중입니다.</p>
    </div>
  );
}
