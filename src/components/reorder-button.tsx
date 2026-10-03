'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from './cart';

export interface ReorderProps {
  lines: { productId: number; uom: string; quantity: number; wanted: number; name: string }[];
  skipped: { name: string; reason: string }[];
  cartHref: string;
  label?: string;
  kind?: 'kush' | 'ghost' | 'dark';
}

/** Adds a past order's cases to the cart (on top of anything already there), then opens the cart. */
export function ReorderButton({ lines, skipped, cartHref, label = 'Reorder', kind = 'kush' }: ReorderProps) {
  const cart = useCart();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const short = lines.filter(l => l.quantity < l.wanted);

  if (!lines.length) {
    return <p className="note-warn" style={{ margin: 0 }}>Nothing from this order is in stock right now{skipped.length ? ` (${skipped.map(s => `${s.name}: ${s.reason}`).join('; ')})` : ''}.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" className={`btn btn-${kind}`} disabled={done} onClick={() => {
        for (const l of lines) cart.set(l.productId, l.uom, cart.qty(l.productId, l.uom) + l.quantity);
        setDone(true);
        router.push(cartHref);
      }}>{done ? 'Opening cart…' : label}</button>
      {(short.length > 0 || skipped.length > 0) && (
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {short.map(l => <div key={`${l.productId}-${l.uom}`}>{l.name}: only {l.quantity} of {l.wanted} in stock</div>)}
          {skipped.map(s => <div key={s.name}>{s.name}: {s.reason}, left out</div>)}
        </div>
      )}
    </div>
  );
}
