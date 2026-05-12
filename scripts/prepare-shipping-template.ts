// 첨부된 CJ 양식의 송장번호 컬럼(I열) 셀 서식을 '@'(텍스트)로 강제 설정한 뒤
// public/shipping-template.xlsx 로 저장한다.
// 일회성 스크립트 — `pnpm tsx scripts/prepare-shipping-template.ts` 로 실행.
import ExcelJS from 'exceljs';
import * as path from 'node:path';
import * as fs from 'node:fs';

const SOURCE = path.resolve(process.cwd(), '배송대행 업로드 엑셀양식.xlsx');
const TARGET = path.resolve(process.cwd(), 'public/shipping-template.xlsx');
const HEADER_ROW = 8;
const TRACKING_COL = 9;
const TEXT_FMT = '@';
const ROWS_TO_FORMAT = 1000;

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`source not found: ${SOURCE}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('no worksheet');

  const header = String(ws.getRow(HEADER_ROW).getCell(TRACKING_COL).value ?? '').trim();
  if (header !== '송장번호') {
    throw new Error(`unexpected header at row ${HEADER_ROW} col ${TRACKING_COL}: ${header}`);
  }

  for (let r = HEADER_ROW; r <= HEADER_ROW + ROWS_TO_FORMAT; r += 1) {
    ws.getRow(r).getCell(TRACKING_COL).numFmt = TEXT_FMT;
  }
  const col = ws.getColumn(TRACKING_COL);
  col.numFmt = TEXT_FMT;

  await wb.xlsx.writeFile(TARGET);
  console.log(`wrote ${TARGET}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
