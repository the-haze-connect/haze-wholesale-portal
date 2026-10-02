'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import { useCart } from './cart';
import { money } from './format';

export function CartView({ items, feePercent }: { items: CatalogItem[]; feePercent: number }) {
  const cart = useCart();
  const [pay, setPay] = useState<'CARD' | 'ACH_WIRE'>('CARD');
  const byId = new Map(items.map(i => [i.id, i]));

  const lines = cart.lines.flatMap(l => {
    const item = byId.get(l.productId);
    const opt = item?.options.find(o => o.uom === l.uom);
    return item && opt ? [{ ...l, item, opt, lineTotal: Math.round(opt.price * l.quantity * 100) / 100 }] : [];
  });
  const missing = cart.lines.length - lines.length;
  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const fee = pay === 'CARD' ? Math.round(subtotal * feePercent) / 100 : 0;

  if (!lines.length) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 48 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Your cart is empty</h2>
        <p style={{ color: 'var(--ink-2)' }}>Add cases from the shop or the quick-order list.</p>
        <Link className="btn btn-kush" href="/#shop">Shop inventory</Link>
      </section>
    );
  }

  return (
    <div className="two">
      <section className="panel">
        <div className="panel-head"><h2 className="display">Items</h2></div>
        {missing > 0 && <p className="pill pill-low">{missing} item{missing > 1 ? 's are' : ' is'} no longer available and {missing > 1 ? 'were' : 'was'} left out.</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Quantity</th><th className="num">Total</th><th><span className="sr">Remove</span></th></tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={`${l.productId}-${l.uom}`}>
                  <td><b>{l.item.name}</b><span className="sub">{l.item.isBulk ? l.opt.label : 'Case'} · {l.item.code}</span></td>
                  <td className="num">{money(l.opt.price)}</td>
                  <td className="num">
                    <div className="step" style={{ display: 'inline-flex' }}>
                      <button type="button" aria-label={`Fewer of ${l.item.name}`} onClick={() => cart.set(l.productId, l.uom, l.quantity - 1)}>−</button>
                      <output>{l.quantity}</output>
                      <button type="button" aria-label={`More of ${l.item.name}`} onClick={() => cart.set(l.productId, l.uom, l.quantity + 1)} disabled={l.quantity >= l.opt.maxQty}>+</button>
                    </div>
                  </td>
                  <td className="num"><b>{money(l.lineTotal)}</b></td>
                  <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => cart.set(l.productId, l.uom, 0)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="rail">
        <section className="panel">
          <p className="label">Summary</p>
          <div className="seg" role="group" aria-label="Payment method" style={{ margin: '12px 0' }}>
            <button type="button" aria-pressed={pay === 'CARD'} onClick={() => setPay('CARD')}>Card</button>
            <button type="button" aria-pressed={pay === 'ACH_WIRE'} onClick={() => setPay('ACH_WIRE')}>ACH / wire</button>
          </div>
          <div className="sum-row"><span>Subtotal</span><b>{money(subtotal)}</b></div>
          {pay === 'CARD' && <div className="sum-row"><span>Card processing ({feePercent}%)</span><b>{money(fee)}</b></div>}
          <div className="sum-row"><span>Total</span><b>{money(subtotal + fee)}</b></div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {pay === 'CARD' ? 'Card orders are approved right away.' : 'We’ll show our ACH and wire details after you submit. Your order is approved once we confirm the payment arrived.'}
          </p>
          <button type="button" className="btn btn-kush" style={{ width: '100%' }} disabled title="Checkout is the next build step">Submit order</button>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 0 }}>Checkout with Authorize.net is the next build step.</p>
        </section>
      </aside>
    </div>
  );
}
