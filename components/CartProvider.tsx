'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartItem = { productId: string; name: string; price: number; quantity: number; imageUrl?: string | null };
type CartCtx = {
  items: CartItem[];
  add: (item: CartItem) => void;
  updateQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = 'exitmall.cart.v1';

export function CartProvider({ children }: { children: ReactNode }) {
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

  const add: CartCtx['add'] = (item) => {
    setItems(prev => {
      const found = prev.find(p => p.productId === item.productId);
      if (found) return prev.map(p => p.productId === item.productId ? { ...p, quantity: p.quantity + item.quantity } : p);
      return [...prev, item];
    });
  };
  const updateQty: CartCtx['updateQty'] = (productId, qty) => {
    if (qty <= 0) return setItems(prev => prev.filter(p => p.productId !== productId));
    setItems(prev => prev.map(p => p.productId === productId ? { ...p, quantity: qty } : p));
  };
  const remove: CartCtx['remove'] = (productId) => setItems(prev => prev.filter(p => p.productId !== productId));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return <Ctx.Provider value={{ items, add, updateQty, remove, clear, total }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
