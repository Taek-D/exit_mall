import { describe, it, expect } from 'vitest';
import { cartToStockOrderPayload } from '@/lib/cart-to-stock-order';

describe('cartToStockOrderPayload', () => {
  it('cart items → { items: [{productId, quantity}] }', () => {
    const cart = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 2 },
      { productId: 'p2', name: 'B', price: 500, quantity: 1 },
    ];
    expect(cartToStockOrderPayload(cart)).toEqual({
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
  });

  it('빈 카트 → items: []', () => {
    expect(cartToStockOrderPayload([])).toEqual({ items: [] });
  });
});
