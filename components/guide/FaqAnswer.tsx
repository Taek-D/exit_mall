import { GuideMarkdown } from '@/lib/guide/markdown';

export function FaqAnswer({ source }: { source: string }) {
  return <GuideMarkdown source={source} />;
}
