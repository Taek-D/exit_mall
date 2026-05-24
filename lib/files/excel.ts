import ExcelJS from 'exceljs';
import JSZip from 'jszip';

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

type ExcelBufferInput = Buffer | ArrayBuffer | Uint8Array;

function toNodeBuffer(buffer: ExcelBufferInput): Buffer {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buffer));
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function sanitizedAppPropertiesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<Application>Microsoft Excel</Application>',
    '<DocSecurity>0</DocSecurity>',
    '<ScaleCrop>false</ScaleCrop>',
    '<Company></Company>',
    '<LinksUpToDate>false</LinksUpToDate>',
    '<SharedDoc>false</SharedDoc>',
    '<HyperlinksChanged>false</HyperlinksChanged>',
    '<AppVersion>16.0300</AppVersion>',
    '</Properties>',
  ].join('');
}

function sanitizedCorePropertiesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties',
    ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:dcterms="http://purl.org/dc/terms/"',
    ' xmlns:dcmitype="http://purl.org/dc/dcmitype/"',
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<dc:creator></dc:creator>',
    '<cp:lastModifiedBy></cp:lastModifiedBy>',
    '<cp:revision>1</cp:revision>',
    '<dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created>',
    '<dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified>',
    '</cp:coreProperties>',
  ].join('');
}

function normalizeSpreadsheetElementPrefixes(xml: string): string {
  return xml.replace(/<(\/?)x:/g, '<$1');
}

function shouldNormalizeSpreadsheetXmlEntry(path: string): boolean {
  return path.startsWith('xl/') && path.endsWith('.xml');
}

async function sanitizeWorkbookCompatibility(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', sanitizedAppPropertiesXml());
  zip.file('docProps/core.xml', sanitizedCorePropertiesXml());

  await Promise.all(
    Object.keys(zip.files).map(async (path) => {
      const file = zip.file(path);
      if (!file || !shouldNormalizeSpreadsheetXmlEntry(path)) return;

      const xml = await file.async('string');
      if (!xml.includes('<x:') && !xml.includes('</x:')) return;

      zip.file(path, normalizeSpreadsheetElementPrefixes(xml));
    }),
  );

  const sanitized = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(sanitized);
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

export async function loadExcelWorkbookFromBuffer(
  buffer: ExcelBufferInput,
): Promise<ExcelJS.Workbook> {
  const nodeBuffer = toNodeBuffer(buffer);

  try {
    return await loadWorkbook(nodeBuffer);
  } catch (error) {
    try {
      return await loadWorkbook(await sanitizeWorkbookCompatibility(nodeBuffer));
    } catch {
      throw error;
    }
  }
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
