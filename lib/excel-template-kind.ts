import ExcelJS from 'exceljs';

export type KnownExcelTemplateKind = 'shipping' | 'inbound';

const SHIPPING_HEADER_KEYS = [
  ['no', '고객주문번호'],
  ['받는사람', '받는분성명'],
  ['연락처', '받는분전화번호'],
  ['주소', '받는분주소(전체,분할)', '받는분주소'],
  ['상품명', '품목명', '관리코드'],
  ['옵션', '내품명', '상품명/옵션'],
  ['수량', '내품수량'],
  ['메모', '배송메세지1'],
  ['송장번호'],
];

const INBOUND_HEADERS = [
  '발송일',
  '상품명',
  '옵션',
  '재고수량',
  '사은품',
  '택배사',
  '송장번호',
  '비고',
];

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

function cellString(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined) return null;
  const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim();
  return s.length === 0 ? null : s;
}

export function normalizeExcelHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/\*+$/g, '');
}

function normalizedRow(ws: ExcelJS.Worksheet, rowNumber: number, maxCols: number): string[] {
  const row = ws.getRow(rowNumber);
  return Array.from({ length: maxCols }, (_, index) =>
    normalizeExcelHeader(cellString(row.getCell(index + 1).value) ?? ''),
  );
}

function matchesHeaderAlternatives(
  actual: string[],
  expected: readonly (readonly string[])[],
  requiredColumns: number,
): boolean {
  for (let i = 0; i < requiredColumns; i += 1) {
    const allowed = expected[i]?.map(normalizeExcelHeader) ?? [];
    if (!allowed.includes(actual[i] ?? '')) return false;
  }
  return true;
}

function matchesHeaderList(actual: string[], expected: readonly string[]): boolean {
  return expected.every((header, index) => actual[index] === normalizeExcelHeader(header));
}

export function detectKnownExcelTemplateKind(
  ws: ExcelJS.Worksheet,
): KnownExcelTemplateKind | null {
  const inboundHeader = normalizedRow(ws, 1, INBOUND_HEADERS.length);
  if (matchesHeaderList(inboundHeader, INBOUND_HEADERS)) return 'inbound';

  const firstColumnShippingKeys = SHIPPING_HEADER_KEYS[0]!.map(normalizeExcelHeader);
  for (let rowNumber = 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = normalizedRow(ws, rowNumber, SHIPPING_HEADER_KEYS.length);
    if (
      firstColumnShippingKeys.includes(row[0] ?? '') &&
      matchesHeaderAlternatives(row, SHIPPING_HEADER_KEYS, 7)
    ) {
      return 'shipping';
    }
  }

  return null;
}

