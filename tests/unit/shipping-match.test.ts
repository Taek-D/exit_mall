import { describe, it, expect } from 'vitest';
import {
  matchInventoryRefs,
  classifyUnknownNames,
  buildInventoryMatchError,
  mergeProductCandidates,
  collectPendingOrderProductIds,
} from '@/lib/shipping-match';

describe('matchInventoryRefs', () => {
  const products = [
    { id: 'p-A', name: '상품A' },
    { id: 'p-B', name: '상품B' },
  ];
  const customs = [
    { id: 'c-X', name: '수기X' },
    { id: 'c-Y', name: '상품A' }, // products 와 동명 — products 우선
  ];

  it('matches names against products first', () => {
    const r = matchInventoryRefs(['상품A', '상품B'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('상품A')).toEqual({ kind: 'product', id: 'p-A' });
    expect(r.refs.get('상품B')).toEqual({ kind: 'product', id: 'p-B' });
  });

  it('falls back to custom when not in products', () => {
    const r = matchInventoryRefs(['수기X'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('수기X')).toEqual({ kind: 'custom', id: 'c-X' });
  });

  it('prefers products on name collision', () => {
    const r = matchInventoryRefs(['상품A'], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('상품A')).toEqual({ kind: 'product', id: 'p-A' });
  });

  it('reports unknown names', () => {
    const r = matchInventoryRefs(['모름1', '상품A', '모름2'], products, customs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknown).toEqual(['모름1', '모름2']);
  });

  it('reports duplicate product names', () => {
    const r = matchInventoryRefs(
      ['상품A'],
      [
        { id: 'p-A', name: '상품A' },
        { id: 'p-A2', name: '상품A' },
      ],
      [],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['상품A']);
  });

  it('matches product names while ignoring whitespace differences', () => {
    const r = matchInventoryRefs(
      ['TobiCom', 'Product  B'],
      [
        { id: 'p-a', name: 'Tobi  Com' },
        { id: 'p-b', name: 'Product B' },
      ],
      [],
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('TobiCom')).toEqual({ kind: 'product', id: 'p-a' });
    expect(r.refs.get('Product  B')).toEqual({ kind: 'product', id: 'p-b' });
  });

  it('reports duplicate product names after whitespace normalization', () => {
    const r = matchInventoryRefs(
      ['ABC'],
      [
        { id: 'p-1', name: 'A BC' },
        { id: 'p-2', name: 'AB C' },
      ],
      [],
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['ABC']);
  });

  it('ignores duplicate normalized names that are unrelated to uploaded names', () => {
    const r = matchInventoryRefs(
      ['Product C'],
      [
        { id: 'p-1', name: 'A BC' },
        { id: 'p-2', name: 'AB C' },
        { id: 'p-3', name: 'ProductC' },
      ],
      [],
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('Product C')).toEqual({ kind: 'product', id: 'p-3' });
  });

  it('reports duplicate custom names after whitespace normalization when no product wins', () => {
    const r = matchInventoryRefs(
      ['CustomABC'],
      [],
      [
        { id: 'c-1', name: 'Custom AB C' },
        { id: 'c-2', name: 'CustomA BC' },
      ],
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['CustomABC']);
  });

  it('handles empty inputs', () => {
    const r = matchInventoryRefs([], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.size).toBe(0);
  });
});

describe('collectPendingOrderProductIds', () => {
  it('collects product_ids only from pending stock_orders', () => {
    const ids = collectPendingOrderProductIds([
      { status: 'pending', items: [{ product_id: 'p-1', qty: 3 }, { product_id: 'p-2', qty: 1 }] },
      { status: 'approved', items: [{ product_id: 'p-approved', qty: 1 }] },
      { status: 'rejected', items: [{ product_id: 'p-rejected', qty: 1 }] },
      { status: 'cancelled', items: [{ product_id: 'p-cancelled', qty: 1 }] },
    ]);
    expect(ids.sort()).toEqual(['p-1', 'p-2']);
  });

  it('excludes rejected and cancelled orders (invariant)', () => {
    const ids = collectPendingOrderProductIds([
      { status: 'rejected', items: [{ product_id: 'p-rejected' }] },
      { status: 'cancelled', items: [{ product_id: 'p-cancelled' }] },
    ]);
    expect(ids).toEqual([]);
  });

  it('dedupes repeated product_ids across pending orders', () => {
    const ids = collectPendingOrderProductIds([
      { status: 'pending', items: [{ product_id: 'p-1' }, { product_id: 'p-1' }] },
      { status: 'pending', items: [{ product_id: 'p-1' }] },
    ]);
    expect(ids).toEqual(['p-1']);
  });

  it('tolerates malformed/missing items', () => {
    const ids = collectPendingOrderProductIds([
      { status: 'pending', items: null },
      { status: 'pending', items: [{ qty: 2 }, null, { product_id: 42 }] },
      { status: 'pending', items: [{ product_id: 'p-ok' }] },
    ]);
    expect(ids).toEqual(['p-ok']);
  });
});

describe('mergeProductCandidates', () => {
  it('unions holding (incl. qty-0) and pending-order products', () => {
    const merged = mergeProductCandidates({
      ownedInventoryProducts: [
        { id: 'p-hold', name: '보유상품' }, // qty 0 holding still surfaced by the row
      ],
      pendingOrderProducts: [{ id: 'p-pending', name: '진행중상품' }],
    });
    expect(merged.map((p) => p.id).sort()).toEqual(['p-hold', 'p-pending']);
  });

  it('dedupes by product id, keeping the holding (first) name', () => {
    const merged = mergeProductCandidates({
      ownedInventoryProducts: [{ id: 'p-dup', name: '보유이름' }],
      pendingOrderProducts: [{ id: 'p-dup', name: '구매요청이름' }],
    });
    expect(merged).toEqual([{ id: 'p-dup', name: '보유이름' }]);
  });

  it('handles empty sources', () => {
    expect(mergeProductCandidates({ ownedInventoryProducts: [], pendingOrderProducts: [] })).toEqual([]);
  });
});

describe('classifyUnknownNames', () => {
  it('routes names that exist in the active catalog to needsPurchaseRequest', () => {
    const r = classifyUnknownNames(['판매중'], ['판매중', '다른상품']);
    expect(r.needsPurchaseRequest).toEqual(['판매중']);
    expect(r.notInCatalog).toEqual([]);
  });

  it('routes names absent from the catalog to notInCatalog', () => {
    const r = classifyUnknownNames(['없는상품'], ['판매중']);
    expect(r.needsPurchaseRequest).toEqual([]);
    expect(r.notInCatalog).toEqual(['없는상품']);
  });

  it('splits a mixed set', () => {
    const r = classifyUnknownNames(['판매중', '없는상품'], ['판매중']);
    expect(r.needsPurchaseRequest).toEqual(['판매중']);
    expect(r.notInCatalog).toEqual(['없는상품']);
  });

  it('classifies using match normalization (whitespace/NFKC insensitive)', () => {
    const r = classifyUnknownNames(['판매 중'], ['판매중']);
    expect(r.needsPurchaseRequest).toEqual(['판매 중']);
    expect(r.notInCatalog).toEqual([]);
  });
});

describe('buildInventoryMatchError', () => {
  it('keeps the duplicate message unchanged', () => {
    const msg = buildInventoryMatchError({ ok: false, duplicates: ['상품A'], unknown: [] }, []);
    expect(msg).toBe(
      '같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): 상품A',
    );
  });

  it('in-catalog unmatched → "먼저 구매요청" branch', () => {
    const msg = buildInventoryMatchError(
      { ok: false, duplicates: [], unknown: ['판매중'] },
      ['판매중'],
    );
    expect(msg).toContain('먼저 상품 구매요청');
    expect(msg).toContain('판매중');
    expect(msg).not.toContain('존재하지 않는 상품명');
  });

  it('not-in-catalog unmatched → existing "존재하지 않는" message', () => {
    const msg = buildInventoryMatchError(
      { ok: false, duplicates: [], unknown: ['없는상품'] },
      ['판매중'],
    );
    expect(msg).toContain('존재하지 않는 상품명이 있습니다: 없는상품');
    expect(msg).not.toContain('먼저 상품 구매요청');
  });

  it('mixed unmatched → reports both groups separately', () => {
    const msg = buildInventoryMatchError(
      { ok: false, duplicates: [], unknown: ['판매중', '없는상품'] },
      ['판매중'],
    );
    expect(msg).toContain('먼저 상품 구매요청');
    expect(msg).toContain('판매중');
    expect(msg).toContain('존재하지 않는 상품명이 있습니다: 없는상품');
  });

  it('truncates to first 3 names with a leading-space ellipsis', () => {
    const msg = buildInventoryMatchError(
      { ok: false, duplicates: [], unknown: ['a', 'b', 'c', 'd'] },
      [],
    );
    expect(msg).toContain('존재하지 않는 상품명이 있습니다: a, b, c …');
  });
});
