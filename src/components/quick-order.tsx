'use client';

import { useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import { useCart } from './cart';
import { Thumb } from './thumb';
import { STOCK_LABEL, money } from './format';

export function QuickOrder({ items, canOrder }: { items: CatalogItem[]; canOrder: boolean }) {
  const cart = useCart();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(i => i.stock !== 'out' && (!t || `${i.name} ${i.code} ${i.sku ?? ''} ${i.category}`.toLowerCase().includes(t)));
  }, [items, q]);

  return (
    <section className="panel">
      <div className="panel-head">
        <label className="search" htmlFor="qo-filter" style={{ marginLeft: 0 }}>
          <span className="sr">Filter products</span>
          <input id="qo-filter" type="search" placeholder="Filter by name, SKU or category" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        {canOrder && <span style={{ fontWeight: 600 }}>{cart.count ? `${cart.count} in cart` : 'Nothing in your cart yet'}</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th className="num">Price</th>{canOrder ? <th className="num">Quantity</th> : <th className="num">Available</th>}</tr></thead>
          <tbody>
            {rows.map(i => i.options.filter(o => o.maxQty > 0).map(o => {
              const id = `qo-${i.id}-${o.uom}`;
              return (
                <tr key={id}>
                  <td><div className="with-thumb"><Thumb src={i.photo} category={i.category} /><div><b>{i.name}</b><span className="sub">{i.sku ? `SKU ${i.sku} · ` : ''}{i.code}</span></div></div></td>
                  <td>{i.brand === 'TOTALLY_BAKED' ? 'TB · ' : ''}{i.category}</td>
                  <td><span className={`pill pill-${i.stock}`}>{STOCK_LABEL[i.stock]}</span></td>
                  <td className="num">{money(o.price)}<span className="sub">per {i.isBulk ? o.label : 'case'}</span></td>
                  {!canOrder ? <td className="num">{i.isBulk ? `${Math.floor(i.available * 4) / 4} lb` : i.available}</td> : <td className="num">
                    <label className="sr" htmlFor={id}>Quantity of {i.name}{i.isBulk ? `, ${o.label}` : ''}</label>
                    <input id={id} type="number" inputMode="numeric" min={0} max={o.maxQty} step={1}
                      value={cart.qty(i.id, o.uom) || ''} placeholder="0"
                      onChange={e => cart.set(i.id, o.uom, Math.min(o.maxQty, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                  </td>}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
