import { describe, it, expect } from 'vitest';
import { matchInventoryRefs } from '@/lib/shipping-match';

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

  it('handles empty inputs', () => {
    const r = matchInventoryRefs([], products, customs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.size).toBe(0);
  });
});
