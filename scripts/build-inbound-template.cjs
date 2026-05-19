// Generates the official inbound-request template.
// Headers MUST match `parseInboundInventoryExcel` in lib/purchased-shipping.ts.
// Run with: node scripts/build-inbound-template.cjs
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADER = [
  '발송일',
  '상품명',
  '옵션',
  '재고수량',
  '사은품',
  '택배사',
  '송장번호',
  '비고',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  const headerRow = ws.addRow(HEADER);
  headerRow.font = { name: '맑은 고딕', size: 11, bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' },
    };
  });

  ws.columns = [
    { width: 14 }, // 발송일
    { width: 22 }, // 상품명
    { width: 18 }, // 옵션
    { width: 12 }, // 재고수량
    { width: 14 }, // 사은품
    { width: 12 }, // 택배사
    { width: 18 }, // 송장번호
    { width: 22 }, // 비고
  ];

  // 송장번호 컬럼은 텍스트 서식으로 고정 (선행 0/지수표기 방지).
  ws.getColumn(7).numFmt = '@';

  const outPath = path.resolve(__dirname, '..', 'public', 'inbound-template.xlsx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
