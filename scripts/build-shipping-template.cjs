// 1회용. node scripts/build-shipping-template.cjs 로 실행하면 public/shipping-template.xlsx 생성.
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const wb = XLSX.utils.book_new();

const aoa = [
  ['배송대행 업로드 양식', '', '', '', '', '', '', '', ''],
  ['CJ대한통운 기준 · 쿠팡/스스 통일 양식', '', '', '', '', '', '', '', ''],
  [],
  ['업로더 정보', '', '', '', '', '', '', '', ''],
  ['상호', '(예: ABC상사)', '담당자 연락처', '010-0000-0000', '', '', '', '', ''],
  ['요청사항', '(공통 메모, 선택)', '', '', '', '', '', '', ''],
  [],
  ['No', '받는사람*', '연락처*', '주소*', '관리코드*', '상품명/옵션', '수량*', '메모', '송장번호'],
  [1, '예시 홍길동', '010-1234-5678', '서울시 강남구 ...', 'SKR-001', '스니커즈/270', 1, '문 앞에 두어주세요', ''],
  [2, '', '', '', '', '', '', '', ''],
];

const ws = XLSX.utils.aoa_to_sheet(aoa);

ws['!cols'] = [
  { wch: 5 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 },
  { wch: 24 }, { wch: 6 }, { wch: 20 }, { wch: 16 },
];

XLSX.utils.book_append_sheet(wb, ws, '배송대행');

const outPath = path.resolve(__dirname, '..', 'public', 'shipping-template.xlsx');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
