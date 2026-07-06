import ExcelJS from 'exceljs';
import { detectKnownExcelTemplateKind } from '@/lib/excel-template-kind';
import { loadExcelWorkbookFromBuffer } from '@/lib/files/excel';

export const SHIPPING_FEE_PER_ROW = 3_300;

export type ParsedShippingItem = {
  no: number;
  /** 신양식(내품코드 열)의 신청자 이름. 구양식(내품코드 열 없음)은 null. */
  internal_code: string | null;
  recipient: string;
  phone: string;
  address: string;
  /** Internal compatibility key. In the current template this stores products.name. */
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

export type ParsedShippingUpload = {
  uploader_company: string | null;
  uploader_phone: string | null;
  request_memo: string | null;
  items: ParsedShippingItem[];
  total_quantity: number;
  shipping_fee_total: number;
};

const HEADER_KEYS = [
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

// 신양식은 위 9개 논리 컬럼 앞(A열)에 "내품코드"(신청자 이름) 열이 하나 붙는다.
const INTERNAL_CODE_KEYS = ['내품코드'];

export function computeShippingFee(rows: number): number {
  return Math.max(0, rows) * SHIPPING_FEE_PER_ROW;
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

function cellString(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined) return null;
  const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim();
  return s.length === 0 ? null : s;
}

function cellInt(value: unknown): number | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function cellTrackingNumber(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.trunc(raw).toString();
  }
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/\*+$/g, '');
}

function rowValues(ws: ExcelJS.Worksheet, rowNumber: number, maxCols: number): unknown[] {
  const row = ws.getRow(rowNumber);
  return Array.from({ length: maxCols }, (_, index) => row.getCell(index + 1).value);
}

export async function parseShippingExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedShippingUpload> {
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadExcelWorkbookFromBuffer(buffer);
  } catch {
    throw new Error('엑셀 파일을 읽을 수 없습니다.');
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트가 없습니다.');

  if (detectKnownExcelTemplateKind(ws) === 'inbound') {
    throw new Error(
      '입고리스트 양식이 업로드되었습니다. 배송대행에서는 배송대행 양식(shipping-template.xlsx)을 내려받아 작성해주세요.',
    );
  }

  // 헤더 행과 컬럼 오프셋을 함께 판별한다.
  //  - A열이 앵커("No"/"고객주문번호")면 구양식(offset 0, 내품코드 없음)
  //  - A열이 "내품코드"이고 B열이 앵커면 신양식(offset 1, 내품코드 있음)
  const anchorKeys = HEADER_KEYS[0]!.map(normalizeHeader);
  const internalCodeKeys = INTERNAL_CODE_KEYS.map(normalizeHeader);
  let headerRow = -1;
  let columnOffset = 0;
  let hasInternalCode = false;
  for (let rowNumber = 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const c0 = normalizeHeader(cellString(ws.getRow(rowNumber).getCell(1).value) ?? '');
    const c1 = normalizeHeader(cellString(ws.getRow(rowNumber).getCell(2).value) ?? '');
    if (anchorKeys.includes(c0)) {
      headerRow = rowNumber;
      columnOffset = 0;
      hasInternalCode = false;
      break;
    }
    if (internalCodeKeys.includes(c0) && anchorKeys.includes(c1)) {
      headerRow = rowNumber;
      columnOffset = 1;
      hasInternalCode = true;
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error('양식의 헤더 행을 찾을 수 없습니다 (첫 컬럼 "내품코드"·"No" 또는 "고객주문번호").');
  }

  const headerCells = rowValues(ws, headerRow, columnOffset + HEADER_KEYS.length).map((value) =>
    normalizeHeader(cellString(value) ?? ''),
  );
  for (let i = 0; i < HEADER_KEYS.length; i += 1) {
    const expected = HEADER_KEYS[i]!;
    const actual = headerCells[columnOffset + i] ?? '';
    if (i < 7 && !expected.map(normalizeHeader).includes(actual)) {
      throw new Error(
        `양식 헤더가 다릅니다 (${columnOffset + i + 1}열: "${actual}" → "${expected[0]}" 기대).`,
      );
    }
  }

  let uploader_company: string | null = null;
  let uploader_phone: string | null = null;
  let request_memo: string | null = null;
  for (let rowNumber = 1; rowNumber < headerRow; rowNumber += 1) {
    const row = rowValues(ws, rowNumber, 4);
    const label0 = cellString(row[0])?.toLowerCase() ?? '';
    const label2 = cellString(row[2])?.toLowerCase() ?? '';
    if (label0 === '상호') uploader_company = cellString(row[1]);
    if (label0 === '담당자 연락처' || label0 === '담당자') uploader_phone = cellString(row[1]);
    if (label2 === '담당자 연락처' || label2 === '담당자') {
      uploader_phone = uploader_phone ?? cellString(row[3]);
    }
    if (label0 === '요청사항') request_memo = cellString(row[1]);
  }

  const items: ParsedShippingItem[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= ws.rowCount; rowNumber += 1) {
    const cells = rowValues(ws, rowNumber, columnOffset + HEADER_KEYS.length);
    const internal_code = hasInternalCode ? cellString(cells[0]) : null;
    const recipient = cellString(cells[columnOffset + 1]);
    const phone = cellString(cells[columnOffset + 2]);
    const address = cellString(cells[columnOffset + 3]);
    const product_code = cellString(cells[columnOffset + 4]);
    const product_name = cellString(cells[columnOffset + 5]);
    const quantity = cellInt(cells[columnOffset + 6]);
    const memo = cellString(cells[columnOffset + 7]);
    const tracking_number = cellTrackingNumber(cells[columnOffset + 8]);

    if (!recipient && !phone && !address && !product_code && quantity === null) continue;

    if (hasInternalCode && !internal_code) {
      throw new Error(`${rowNumber}행 내품코드가 비어있습니다.`);
    }
    if (!recipient) throw new Error(`${rowNumber}행 받는사람이 비어있습니다.`);
    if (!phone) throw new Error(`${rowNumber}행 연락처가 비어있습니다.`);
    if (!address) throw new Error(`${rowNumber}행 주소가 비어있습니다.`);
    if (!product_code) throw new Error(`${rowNumber}행 상품명이 비어있습니다.`);
    if (quantity === null || quantity < 1) {
      throw new Error(`${rowNumber}행(${recipient}): 수량은 1 이상의 정수여야 합니다.`);
    }

    items.push({
      no: items.length + 1,
      internal_code,
      recipient,
      phone,
      address,
      product_code,
      product_name,
      quantity,
      memo,
      tracking_number,
    });
  }

  if (items.length === 0) throw new Error('주문 항목이 한 줄도 입력되지 않았습니다.');

  const total_quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const shipping_fee_total = computeShippingFee(items.length);

  return {
    uploader_company,
    uploader_phone,
    request_memo,
    items,
    total_quantity,
    shipping_fee_total,
  };
}
