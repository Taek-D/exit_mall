import * as XLSX from 'xlsx';

export const SHIPPING_FEE_PER_ROW = 3_300;

export type ParsedShippingItem = {
  no: number;
  recipient: string;
  phone: string;
  address: string;
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

const HEADER_KEYS = ['no', '받는사람', '연락처', '주소', '관리코드', '상품명/옵션', '수량', '메모', '송장번호'];

export function computeShippingFee(rows: number): number {
  return Math.max(0, rows) * SHIPPING_FEE_PER_ROW;
}

function cellString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function cellInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseShippingExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): ParsedShippingUpload {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('엑셀 파일을 읽을 수 없습니다.');
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('시트가 없습니다.');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('시트를 읽을 수 없습니다.');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  // 헤더 행 위치 탐색: 첫 컬럼이 "No" 인 첫 행
  let headerRow = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    if (cellString(r[0])?.toLowerCase() === 'no') {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error('양식의 헤더 행을 찾을 수 없습니다 (첫 컬럼 "No").');

  // 헤더 검증 (키 순서)
  const headerCells = (rows[headerRow] ?? []).map((c) => cellString(c)?.toLowerCase() ?? '');
  for (let i = 0; i < HEADER_KEYS.length; i += 1) {
    const expected = HEADER_KEYS[i]!;
    const actual = headerCells[i] ?? '';
    if (i < 7 && actual !== expected.toLowerCase()) {
      throw new Error(`양식 헤더가 다릅니다 (${i + 1}열): "${actual}" → "${expected}" 기대.`);
    }
  }

  // 헤더 위쪽 안에서 업로더 정보 탐색
  let uploader_company: string | null = null;
  let uploader_phone: string | null = null;
  let request_memo: string | null = null;
  for (let i = 0; i < headerRow; i += 1) {
    const r = rows[i] ?? [];
    const label0 = cellString(r[0])?.toLowerCase() ?? '';
    const label2 = cellString(r[2])?.toLowerCase() ?? '';
    if (label0 === '상호') uploader_company = cellString(r[1]);
    if (label0 === '담당자 연락처' || label0 === '담당자') uploader_phone = cellString(r[1]);
    if (label2 === '담당자 연락처' || label2 === '담당자') {
      uploader_phone = uploader_phone ?? cellString(r[3]);
    }
    if (label0 === '요청사항') request_memo = cellString(r[1]);
  }

  const items: ParsedShippingItem[] = [];
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const cells = rows[r] ?? [];
    const recipient = cellString(cells[1]);
    const phone = cellString(cells[2]);
    const address = cellString(cells[3]);
    const product_code = cellString(cells[4]);
    const product_name = cellString(cells[5]);
    const quantity = cellInt(cells[6]);
    const memo = cellString(cells[7]);
    const tracking_number = cellString(cells[8]);

    // 완전 빈 행 스킵
    if (!recipient && !phone && !address && !product_code && quantity === null) continue;

    if (!recipient) throw new Error(`${r + 1}행: 받는사람이 비어있습니다.`);
    if (!phone) throw new Error(`${r + 1}행: 연락처가 비어있습니다.`);
    if (!address) throw new Error(`${r + 1}행: 주소가 비어있습니다.`);
    if (!product_code) throw new Error(`${r + 1}행: 관리코드가 비어있습니다.`);
    if (quantity === null || quantity < 1) {
      throw new Error(`${r + 1}행 (${recipient}): 수량은 1 이상의 정수여야 합니다.`);
    }

    items.push({
      no: items.length + 1,
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

  if (items.length === 0) {
    throw new Error('주문 항목이 한 줄도 입력되지 않았습니다.');
  }

  const total_quantity = items.reduce((s, it) => s + it.quantity, 0);
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
