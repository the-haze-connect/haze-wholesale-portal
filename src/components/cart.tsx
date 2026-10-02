'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface CartLine {
  productId: number;
  uom: string;
  quantity: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  qty: (productId: number, uom: string) => number;
  set: (productId: number, uom: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);
const KEY = 'haze-wholesale-cart-v1';

/** Cart kept in the browser until server-side carts arrive with sign-in. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setLines(JSON.parse(raw)); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ }
  }, [lines]);

  const set = useCallback((productId: number, uom: string, quantity: number) => {
    setLines(prev => {
      const rest = prev.filter(l => !(l.productId === productId && l.uom === uom));
      return quantity > 0 ? [...rest, { productId, uom, quantity }] : rest;
    });
  }, []);

  const api = useMemo<CartApi>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    qty: (id, uom) => lines.find(l => l.productId === id && l.uom === uom)?.quantity ?? 0,
    set,
    clear: () => setLines([]),
  }), [lines, set]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}

export function CartBadge() {
  const { count } = useCart();
  return count ? <span className="badge" aria-label={`${count} in cart`}>{count}</span> : null;
}
