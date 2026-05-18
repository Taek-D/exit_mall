// Generates the official shipping upload template.
// Run with: node scripts/build-shipping-template.cjs
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADER = [
  '고객주문번호',
  '받는분성명',
  '받는분전화번호',
  '받는분주소(전체, 분할)',
  '품목명',
  '내품명',
  '내품수량',
  '배송메세지1',
  '송장번호',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  ws.addRow(HEADER);

  ws.columns = [
    { width: 17.796875 },
    { width: 14.296875 },
    { width: 14.296875 },
    { width: 20 },
    { width: 14.296875 },
    { width: 17.796875 },
    { width: 14.296875 },
    { width: 14.296875 },
    { width: 10 },
  ];

  const outPath = path.resolve(__dirname, '..', 'public', 'shipping-template.xlsx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
