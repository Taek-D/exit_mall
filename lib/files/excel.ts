const DEFAULT_ALLOWED_EXTENSIONS = ['.xlsx'];
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type ExcelUploadOptions = {
  maxBytes: number;
  allowedExtensions?: string[];
  emptyMessage?: string;
  sizeLabel?: string;
  sizeMessage?: string;
  extensionMessage?: string;
  invalidTypeMessage?: string;
};

export type ExcelUploadValidationResult =
  | { ok: true; file: File; buffer: Buffer }
  | { ok: false; error: string };

export async function fileToBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

export async function validateExcelUpload(
  entry: FormDataEntryValue | null,
  {
    maxBytes,
    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
    emptyMessage = '파일을 선택해주세요.',
    sizeLabel = formatBytes(maxBytes),
    sizeMessage = `파일 크기는 ${sizeLabel} 이하여야 합니다.`,
    extensionMessage = '.xlsx 파일만 업로드할 수 있습니다.',
    invalidTypeMessage = '엑셀(.xlsx) 파일 형식이 아닙니다.',
  }: ExcelUploadOptions,
): Promise<ExcelUploadValidationResult> {
  if (!(entry instanceof File) || entry.size === 0) {
    return { ok: false, error: emptyMessage };
  }

  if (entry.size > maxBytes) {
    return { ok: false, error: sizeMessage };
  }

  const lowered = entry.name.toLowerCase();
  if (!allowedExtensions.some((ext) => lowered.endsWith(ext))) {
    return { ok: false, error: extensionMessage };
  }

  const buffer = await fileToBuffer(entry);
  if (buffer.length < OOXML_MAGIC.length || !buffer.subarray(0, OOXML_MAGIC.length).equals(OOXML_MAGIC)) {
    return { ok: false, error: invalidTypeMessage };
  }

  return { ok: true, file: entry, buffer };
}

export function safeStorageName(
  name: string,
  { allowKorean = false, fallback = 'upload.xlsx' }: { allowKorean?: boolean; fallback?: string } = {},
): string {
  const pattern = allowKorean ? /[^\w가-힣.\-]+/g : /[^\w.\-]+/g;
  const sanitized = name.normalize('NFKC').replace(pattern, '_').replace(/^_+|_+$/g, '');
  return sanitized || fallback;
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)}MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024}KB`;
  return `${bytes}B`;
}
