import ExcelJS from 'exceljs';

export const PRODUCT_IMPORT_HEADERS = [
  '제품이미지',
  '브랜드',
  '상품명',
  '옵션',
  '고객 판매가',
  '관리코드',
  '카테고리',
  '바코드',
  '비고',
] as const;

export type ProductImportImage = {
  extension: string;
  contentType: string;
  buffer: Buffer;
  width: number;
  height: number;
};

export type ParsedProductImportRow = {
  rowNumber: number;
  brand: string | null;
  productName: string | null;
  optionName: string | null;
  displayName: string;
  importKey: string;
  price: number | null;
  managementCode: string | null;
  category: string | null;
  barcode: string | null;
  memo: string | null;
  hasImage: boolean;
  image?: ProductImportImage;
  errors: string[];
  warnings: string[];
};

export type ParsedProductImport = {
  sheetName: string;
  rows: ParsedProductImportRow[];
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function toNodeBuffer(buffer: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buffer));
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function rawCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return value;
}

function cellString(value: ExcelJS.CellValue): string | null {
  const raw = rawCellValue(value);
  if (raw === null || raw === undefined) return null;
  const text = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw);
  const normalized = normalizeText(text);
  return normalized.length === 0 ? null : normalized;
}

function cellPrice(value: ExcelJS.CellValue): number | null {
  const raw = rawCellValue(value);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[,\s₩원]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/\*+$/g, '').toLocaleLowerCase('ko-KR');
}

export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function normalizeImportKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase('ko-KR');
}

function displayName(productName: string | null, optionName: string | null): string {
  if (!productName) return '';
  return optionName ? `${productName} / ${optionName}` : productName;
}

function addDuplicateWarnings(
  rows: ParsedProductImportRow[],
  key: 'managementCode' | 'barcode',
  label: string,
) {
  const seen = new Map<string, ParsedProductImportRow[]>();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    const bucket = seen.get(value) ?? [];
    bucket.push(row);
    seen.set(value, bucket);
  }

  for (const [value, bucket] of seen) {
    if (bucket.length < 2) continue;
    for (const row of bucket) {
      row.warnings.push(`${label} 중복: ${value}`);
    }
  }
}

function addDuplicateDisplayNameErrors(rows: ParsedProductImportRow[]) {
  const seen = new Map<string, ParsedProductImportRow[]>();
  for (const row of rows) {
    if (!row.importKey) continue;
    const bucket = seen.get(row.importKey) ?? [];
    bucket.push(row);
    seen.set(row.importKey, bucket);
  }

  for (const bucket of seen.values()) {
    if (bucket.length < 2) continue;
    const rowNumbers = bucket.map((row) => row.rowNumber).join(', ');
    for (const row of bucket) {
      row.errors.push(`상품명 / 옵션 조합이 중복됩니다: ${rowNumbers}행`);
    }
  }
}

function collectRowImages(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet) {
  const images = new Map<number, ProductImportImage>();

  for (const imageRef of worksheet.getImages()) {
    const range = imageRef.range as any;
    const topLeft = range?.tl;
    const rowNumber =
      typeof topLeft?.nativeRow === 'number'
        ? topLeft.nativeRow + 1
        : typeof topLeft?.row === 'number'
          ? Math.floor(topLeft.row) + 1
          : null;
    const colNumber =
      typeof topLeft?.nativeCol === 'number'
        ? topLeft.nativeCol + 1
        : typeof topLeft?.col === 'number'
          ? Math.floor(topLeft.col) + 1
          : null;

    if (!rowNumber || colNumber !== 1) continue;

    const media =
      (workbook as any).getImage?.(imageRef.imageId) ??
      (workbook as any).model?.media?.[imageRef.imageId];
    if (!media?.buffer) continue;

    const extension = String(media.extension ?? 'png').toLowerCase();
    const width = Number(range?.ext?.width ?? 0);
    const height = Number(range?.ext?.height ?? 0);
    const next: ProductImportImage = {
      extension,
      contentType: CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
      buffer: toNodeBuffer(media.buffer),
      width,
      height,
    };

    const current = images.get(rowNumber);
    const currentArea = (current?.width ?? 0) * (current?.height ?? 0);
    const nextArea = width * height;
    if (!current || nextArea > currentArea) {
      images.set(rowNumber, next);
    }
  }

  return images;
}

export async function parseProductImportExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedProductImport> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
    throw new Error('엑셀 파일을 읽을 수 없습니다. .xlsx 파일인지 확인해주세요.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('엑셀 시트가 없습니다.');

  const header = worksheet.getRow(1);
  for (let index = 0; index < PRODUCT_IMPORT_HEADERS.length; index += 1) {
    const expected = PRODUCT_IMPORT_HEADERS[index]!;
    const actual = cellString(header.getCell(index + 1).value) ?? '';
    if (normalizeHeader(actual) !== normalizeHeader(expected)) {
      throw new Error(
        `엑셀 헤더가 올바르지 않습니다. ${index + 1}번째 열은 "${expected}"이어야 합니다.`,
      );
    }
  }

  const rowImages = collectRowImages(workbook, worksheet);
  const rows: ParsedProductImportRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const brand = cellString(row.getCell(2).value);
    const productName = cellString(row.getCell(3).value);
    const optionName = cellString(row.getCell(4).value);
    const price = cellPrice(row.getCell(5).value);
    const managementCode = cellString(row.getCell(6).value);
    const category = cellString(row.getCell(7).value);
    const barcode = cellString(row.getCell(8).value);
    const memo = cellString(row.getCell(9).value);
    const image = rowImages.get(rowNumber);

    const hasAnyValue = [
      brand,
      productName,
      optionName,
      price,
      managementCode,
      category,
      barcode,
      memo,
    ].some((value) => value !== null && value !== undefined);
    if (!hasAnyValue && !image) continue;

    const name = displayName(productName, optionName);
    const parsed: ParsedProductImportRow = {
      rowNumber,
      brand,
      productName,
      optionName,
      displayName: name,
      importKey: name ? normalizeImportKey(name) : '',
      price: price === null ? null : Math.trunc(price),
      managementCode,
      category,
      barcode,
      memo,
      hasImage: Boolean(image),
      image,
      errors: [],
      warnings: [],
    };

    if (!productName) parsed.errors.push('상품명이 비어 있습니다.');
    if (!optionName) parsed.errors.push('옵션이 비어 있습니다.');
    if (parsed.displayName.length > 100) {
      parsed.errors.push('상품명 / 옵션 조합은 100자 이하여야 합니다.');
    }
    if (price === null || !Number.isInteger(price) || price < 0) {
      parsed.errors.push('고객 판매가는 0 이상의 정수여야 합니다.');
    }
    if (memo && memo.length > 1000) {
      parsed.errors.push('비고는 1000자 이하여야 합니다.');
    }
    if (!image) parsed.warnings.push('제품 이미지가 없습니다.');

    rows.push(parsed);
  }

  if (rows.length === 0) {
    throw new Error('등록할 상품 행이 없습니다.');
  }

  addDuplicateDisplayNameErrors(rows);
  addDuplicateWarnings(rows, 'managementCode', '관리코드');
  addDuplicateWarnings(rows, 'barcode', '바코드');

  return { sheetName: worksheet.name, rows };
}
