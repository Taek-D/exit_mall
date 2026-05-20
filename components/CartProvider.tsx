'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartLimit = {
  perUserLimit: number | null;
  alreadyBought: number;
  stock: number;
};

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  perUserLimit?: number | null;
  alreadyBought?: number;
  stock?: number;
};

export type CartLimitInfo = {
  perUserLimit: number | null;
  alreadyBought: number;
  maxCartQuantity: number | null;
  remaining: number | null;
  quantity: number;
  reached: boolean;
  stock: number | null;
  stockExceeded: boolean;
};

type CartCtx = {
  items: CartItem[];
  add: (item: CartItem) => boolean;
  updateQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  getLimitInfo: (productId: string) => CartLimitInfo;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = 'exitmall.cart.v1';

export function CartProvider({
  children,
  limits = {},
}: {
  children: ReactNode;
  limits?: Record<string, CartLimit>;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  useEffect(() => {
    if (!loaded) return;
    setItems((prev) => applyLimits(prev, limits));
  }, [loaded, limits]);

  const add: CartCtx['add'] = (item) => {
    const currentLimitInfo = computeCartLimitInfo(item.productId, items, limits, item);
    const current = items.find((p) => p.productId === item.productId);
    if (currentLimitInfo.maxCartQuantity !== null) {
      if (currentLimitInfo.maxCartQuantity <= 0) return false;
      if ((current?.quantity ?? 0) >= currentLimitInfo.maxCartQuantity) return false;
    }

    setItems(prev => {
      const limitInfo = computeCartLimitInfo(item.productId, prev, limits, item);
      if (limitInfo.maxCartQuantity !== null && limitInfo.maxCartQuantity <= 0) return prev;

      const found = prev.find(p => p.productId === item.productId);
      if (found) {
        const nextQty = clampQuantity(found.quantity + item.quantity, limitInfo.maxCartQuantity);
        return prev.map(p => p.productId === item.productId ? { ...p, ...item, quantity: nextQty } : p);
      }

      const quantity = clampQuantity(item.quantity, limitInfo.maxCartQuantity);
      if (quantity <= 0) return prev;
      return [...prev, { ...item, quantity }];
    });
    return true;
  };
  const updateQty: CartCtx['updateQty'] = (productId, qty) => {
    if (qty <= 0) return setItems(prev => prev.filter(p => p.productId !== productId));
    setItems(prev => {
      const limitInfo = computeCartLimitInfo(productId, prev, limits);
      const quantity = clampQuantity(qty, limitInfo.maxCartQuantity);
      if (quantity <= 0) return prev.filter(p => p.productId !== productId);
      return prev.map(p => p.productId === productId ? { ...p, quantity } : p);
    });
  };
  const remove: CartCtx['remove'] = (productId) => setItems(prev => prev.filter(p => p.productId !== productId));
  const clear = () => setItems([]);
  const getLimitInfo: CartCtx['getLimitInfo'] = (productId) => computeCartLimitInfo(productId, items, limits);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return <Ctx.Provider value={{ items, add, updateQty, remove, clear, getLimitInfo, total }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}

function applyLimits(items: CartItem[], limits: Record<string, CartLimit>) {
  return items
    .map((item) => {
      const limitInfo = computeCartLimitInfo(item.productId, items, limits, item);
      const quantity = clampQuantity(item.quantity, limitInfo.maxCartQuantity);
      return { ...item, quantity };
    })
    .filter((item) => item.quantity > 0);
}

export function computeCartLimitInfo(
  productId: string,
  items: CartItem[],
  limits: Record<string, CartLimit>,
  fallback?: CartItem,
): CartLimitInfo {
  const item = items.find((p) => p.productId === productId) ?? fallback;
  const serverLimit = limits[productId];
  const perUserLimit = serverLimit?.perUserLimit ?? item?.perUserLimit ?? null;
  const alreadyBought = serverLimit?.alreadyBought ?? item?.alreadyBought ?? 0;
  const stock = serverLimit?.stock ?? item?.stock ?? fallback?.stock ?? null;
  const quantity = item?.quantity ?? 0;
  const remaining = perUserLimit === null ? null : Math.max(0, perUserLimit - alreadyBought);
  const stockLimit = stock === null || stock < 0 ? null : Math.max(0, stock);
  const maxCartQuantity =
    remaining === null && stockLimit === null
      ? null
      : Math.min(remaining ?? Number.POSITIVE_INFINITY, stockLimit ?? Number.POSITIVE_INFINITY);

  return {
    perUserLimit,
    alreadyBought,
    stock,
    maxCartQuantity,
    remaining,
    quantity,
    reached: maxCartQuantity !== null && quantity >= maxCartQuantity,
    stockExceeded: stockLimit !== null && quantity > stockLimit,
  };
}

function clampQuantity(quantity: number, maxQuantity: number | null) {
  const normalized = Math.max(0, Math.floor(quantity));
  return maxQuantity === null ? normalized : Math.min(normalized, maxQuantity);
}
