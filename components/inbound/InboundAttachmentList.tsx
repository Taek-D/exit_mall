import { createClient } from '@/lib/supabase/server';
import { FileSpreadsheet, ImageIcon, AlertCircle } from 'lucide-react';

type Props = {
  requestId: string;
  excelPath: string;
  excelOriginalName: string;
  imagePaths: string[];
};

async function sign(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from('inbound-requests')
    .createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

export async function InboundAttachmentList({
  excelPath,
  excelOriginalName,
  imagePaths,
}: Props) {
  const [excelUrl, ...imageUrls] = await Promise.all([
    sign(excelPath),
    ...imagePaths.map((p) => sign(p)),
  ]);

  return (
    <div className="space-y-3">
      {excelUrl ? (
        <a
          href={excelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
          <span className="truncate max-w-[280px]">{excelOriginalName}</span>
        </a>
      ) : (
        <div
          role="alert"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground cursor-not-allowed"
          title="다운로드 링크를 발급할 수 없습니다. 잠시 후 새로고침 하세요."
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          <span className="truncate max-w-[280px]">
            {excelOriginalName} (다운로드 불가)
          </span>
        </div>
      )}
      {imagePaths.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 max-w-md">
          {imageUrls.map((url, i) =>
            url ? (
              <li key={imagePaths[i]} className="aspect-square rounded-md overflow-hidden border bg-muted">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`첨부 이미지 ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              </li>
            ) : (
              <li
                key={`missing-${i}`}
                className="aspect-square rounded-md border grid place-items-center bg-muted text-muted-foreground"
                role="alert"
                title="이미지를 불러올 수 없습니다"
              >
                <ImageIcon className="h-5 w-5" aria-hidden />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
