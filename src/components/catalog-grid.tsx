'use client';

import { useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import { useCart } from './cart';
import { STOCK_LABEL, TILE, money } from './format';

const CATEGORIES = ['All', 'Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower'];
const BRANDS = [['ALL', 'Both brands'], ['HAZE', 'The Haze Connect'], ['TOTALLY_BAKED', 'Totally Baked']] as const;

export function CatalogGrid({ items, canOrder, initialCategory = 'All' }: { items: CatalogItem[]; canOrder: boolean; initialCategory?: string }) {
  const [cat, setCat] = useState(initialCategory);
  const [brand, setBrand] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(i =>
      (cat === 'All' || i.category === cat) &&
      (brand === 'ALL' || i.brand === brand) &&
      (!inStockOnly || i.stock !== 'out') &&
      (!term || `${i.name} ${i.code} ${i.sku ?? ''}`.toLowerCase().includes(term)));
  }, [items, cat, brand, q, inStockOnly]);

  const present = new Set(items.map(i => i.category));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filters">
        <div className="chips" role="group" aria-label="Filter by category">
          {CATEGORIES.filter(c => c === 'All' || present.has(c)).map(c => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <label className="search" htmlFor="shop-search">
          <span className="sr">Search products</span>
          <input id="shop-search" type="search" placeholder="Search name, strain or SKU" value={q} onChange={e => setQ(e.target.value)} />
        </label>
      </div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Filter by brand">
          {BRANDS.map(([k, l]) => <button key={k} type="button" aria-pressed={brand === k} onClick={() => setBrand(k)}>{l}</button>)}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 44 }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} style={{ width: 18, height: 18 }} />
          In stock only
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 14 }}>{shown.length} of {items.length} products</span>
      </div>
      {shown.length ? (
        <div className="grid">{shown.map(i => <ProductCard key={i.id} item={i} canOrder={canOrder} />)}</div>
      ) : (
        <p className="empty">No products match these filters.</p>
      )}
    </div>
  );
}

function ProductCard({ item, canOrder }: { item: CatalogItem; canOrder: boolean }) {
  const cart = useCart();
  const [uom, setUom] = useState(item.options[item.options.length - 1].uom);
  const opt = item.options.find(o => o.uom === uom) ?? item.options[0];
  const n = cart.qty(item.id, opt.uom);
  const canAdd = n < opt.maxQty;

  return (
    <article className="prod">
      <div className={`tile${item.photo ? ' has-photo' : ''}`} style={{ background: item.photo ? '#fff' : TILE[item.category] ?? '#204B57' }}>
        {item.photo && <img src={item.photo} alt="" loading="lazy" decoding="async" />}
        <span className={`stock stock-${item.stock}`}>{STOCK_LABEL[item.stock]}</span>
        {!item.photo && <span className="tile-word" aria-hidden="true">{item.brand === 'TOTALLY_BAKED' ? 'Totally Baked' : item.category}</span>}
      </div>
      <div className="prod-body">
        <div style={{ flex: 1 }}>
          <h3>{item.name}</h3>
          <p className="spec">{item.sku ? `SKU ${item.sku} · ` : ''}{item.code}</p>
        </div>
        {item.isBulk && (
          <div className="sizes" role="group" aria-label="Bag size">
            {item.options.map(o => (
              <button key={o.uom} type="button" aria-pressed={o.uom === opt.uom} onClick={() => setUom(o.uom)} disabled={o.maxQty < 1}>{o.label}</button>
            ))}
          </div>
        )}
        <div className="price">
          <b>{money(opt.price)} <small>/ {item.isBulk ? opt.label : 'case'}</small></b>
          {item.msrp ? <small>MSRP {money(item.msrp)}</small> : null}
        </div>
        {!canOrder ? null : item.stock === 'out' ? (
          <button type="button" className="notify" disabled title="Restock alerts arrive with sign-in">Notify me when back</button>
        ) : (
          <div className="buy">
            <div className="step">
              <button type="button" aria-label={`Fewer of ${item.name}`} onClick={() => cart.set(item.id, opt.uom, n - 1)} disabled={n < 1}>−</button>
              <output aria-live="polite">{n}</output>
              <button type="button" aria-label={`More of ${item.name}`} onClick={() => cart.set(item.id, opt.uom, n + 1)} disabled={!canAdd}>+</button>
            </div>
            <button type="button" className={`add${n ? ' on' : ''}`} onClick={() => canAdd && cart.set(item.id, opt.uom, n + 1)} disabled={!canAdd}>
              {!canAdd ? 'Max in stock' : n ? 'Add another' : 'Add to cart'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
