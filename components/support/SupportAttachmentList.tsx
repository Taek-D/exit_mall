import { Download, FileText, ImageIcon } from 'lucide-react';
import { getSupportAttachmentUrlAction } from '@/lib/actions/support-request';
import type { SupportAttachmentRow } from '@/lib/support/queries';

type Props = {
  requestId: string;
  attachments: SupportAttachmentRow[];
};

function isImageAttachment(attachment: SupportAttachmentRow): boolean {
  const name = attachment.original_name.toLowerCase();
  return (
    attachment.content_type.startsWith('image/') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function SupportAttachmentList({ requestId, attachments }: Props) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">첨부 파일이 없습니다.</p>;
  }

  const signedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      const result = await getSupportAttachmentUrlAction(requestId, attachment.id);
      return {
        attachment,
        url: result.ok ? result.url : null,
      };
    }),
  );

  const images = signedAttachments.filter(({ attachment }) => isImageAttachment(attachment));

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {signedAttachments.map(({ attachment, url }) => {
          const size = formatBytes(attachment.size_bytes);
          const content = (
            <>
              <FileText className="h-4 w-4 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{attachment.original_name}</span>
              {size && <span className="shrink-0 text-xs text-muted-foreground">{size}</span>}
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          );

          return (
            <li key={attachment.id}>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 max-w-full items-center gap-2 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-muted"
                  download={attachment.original_name}
                >
                  {content}
                </a>
              ) : (
                <div
                  role="alert"
                  title="다운로드 링크를 발급할 수 없습니다. 잠시 후 다시 시도해 주세요."
                  className="inline-flex h-9 max-w-full cursor-not-allowed items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground opacity-70"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {images.length > 0 && (
        <ul className="grid max-w-md grid-cols-3 gap-2">
          {images.map(({ attachment, url }) =>
            url ? (
              <li key={`preview-${attachment.id}`} className="aspect-square overflow-hidden rounded-md border bg-muted">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={attachment.original_name}
                    className="h-full w-full object-cover"
                  />
                </a>
              </li>
            ) : (
              <li
                key={`preview-missing-${attachment.id}`}
                className="grid aspect-square place-items-center rounded-md border bg-muted text-muted-foreground opacity-70"
                role="alert"
                title="이미지를 불러올 수 없습니다."
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
