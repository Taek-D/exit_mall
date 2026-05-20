import { describe, expect, it } from 'vitest';
import { computeCartLimitInfo, type CartItem, type CartLimit } from '@/components/CartProvider';

describe('computeCartLimitInfo', () => {
  it('uses stock as the max cart quantity when stock is finite', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 5, stock: 3 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: null, alreadyBought: 0, stock: 3 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      stock: 3,
      stockExceeded: true,
      maxCartQuantity: 3,
      reached: true,
    });
  });

  it('treats stock -1 as unlimited stock', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 50, stock: -1 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: null, alreadyBought: 0, stock: -1 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      stock: -1,
      stockExceeded: false,
      maxCartQuantity: null,
      reached: false,
    });
  });

  it('uses the smaller value between remaining purchase limit and stock', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 2, stock: 10 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: 5, alreadyBought: 3, stock: 10 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      remaining: 2,
      maxCartQuantity: 2,
      reached: true,
      stockExceeded: false,
    });
  });

  it('uses fallback stock for existing stored cart items without stock', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 5 },
    ];
    const fallback: CartItem = { productId: 'p1', name: 'A', price: 1000, quantity: 1, stock: 3 };

    expect(computeCartLimitInfo('p1', items, {}, fallback)).toMatchObject({
      stock: 3,
      stockExceeded: true,
      maxCartQuantity: 3,
    });
  });
});
