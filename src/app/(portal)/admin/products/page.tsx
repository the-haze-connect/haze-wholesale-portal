import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { money } from '@/components/format';
import { Thumb } from '@/components/thumb';
import { effectivePhoto } from '@/lib/catalog';
import { db } from '@/lib/db';
import { resetProductPhoto, toggleProductVisible } from './actions';
import { PhotoForm } from './photo-form';

export const dynamic = 'force-dynamic';

const SHOW = [['instock', 'In stock'], ['nophoto', 'In stock, no photo'], ['all', 'All'], ['hidden', 'Hidden from portal']] as const;
const CATEGORIES = ['Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower'];
const SOURCE = { sku: 'Store match', strain: 'Store match (same strain)', line: 'Store match (product line)' } as const;

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const show = SHOW.some(([k]) => k === sp.show) ? sp.show! : 'instock';
  const cat = CATEGORIES.includes(sp.cat ?? '') ? sp.cat! : null;
  const noPhoto: Prisma.ProductWhereInput = { OR: [{ photoOverride: 'none' }, { photoOverride: null, photoUrl: null }] };

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(cat ? { category: cat } : {}),
    ...(show === 'instock' ? { visible: true, available: { gt: 0 } } :
      show === 'nophoto' ? { visible: true, available: { gt: 0 }, AND: [noPhoto] } :
      show === 'hidden' ? { visible: false } : {}),
  };

  const [products, inStock, inStockNoPhoto] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 300 }),
    db.product.count({ where: { active: true, visible: true, available: { gt: 0 } } }),
    db.product.count({ where: { active: true, visible: true, available: { gt: 0 }, AND: [noPhoto] } }),
  ]);
  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, show, cat, ...over })) if (v) p.set(k, v);
    return `/admin/products?${p.toString()}`;
  };

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Products</h1>
          <p>Products, prices and stock come from Order Time. Photos are matched automatically from thehazeconnect.com and totallybakedhemp.com every hour; add your own here and it replaces the automatic one.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><small>In stock on the portal</small><strong>{inStock}</strong></div>
        <div className="kpi"><small>With a photo</small><strong>{inStock - inStockNoPhoto}</strong></div>
        <div className="kpi"><small>Still need a photo</small><strong>{inStockNoPhoto}</strong></div>
      </div>

      <section className="panel">
        <form className="filters" action="/admin/products" method="get" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Name or Order Time code" /></div>
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select id="cat" name="cat" defaultValue={cat ?? ''}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input type="hidden" name="show" value={show} />
          <button className="btn btn-dark" type="submit">Search</button>
        </form>
        <div className="chips" role="group" aria-label="Show" style={{ marginBottom: 12 }}>
          {SHOW.map(([k, label]) => (
            <Link key={k} href={qs({ show: k })} className="btn btn-sm btn-ghost" aria-current={show === k ? 'page' : undefined}
              style={show === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>{label}</Link>
          ))}
        </div>

        {products.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Photo</th><th className="num">Base price</th><th className="num">HQ stock</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {products.map(p => {
                  const photo = effectivePhoto(p.photoOverride, p.photoUrl);
                  const label = p.photoOverride === 'none' ? 'Hidden by you'
                    : p.photoOverride ? (p.photoOverride.startsWith('/photos/') ? 'Your upload' : 'Your link')
                    : p.photoUrl ? SOURCE[(p.photoSource ?? 'sku') as keyof typeof SOURCE] ?? 'Store match' : 'No photo';
                  return (
                    <tr key={p.id} style={!p.visible ? { opacity: .6 } : undefined}>
                      <td>
                        <div className="with-thumb">
                          {photo ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="" className="thumb" style={{ width: 64, height: 64 }} loading="lazy" /></a> : <Thumb src={null} category={p.category} />}
                          <div><b>{p.name}</b><span className="sub">{p.code} · {p.category}{!p.visible ? ' · hidden' : ''}</span></div>
                        </div>
                      </td>
                      <td><span className={`pill ${photo ? 'pill-in' : 'pill-low'}`}>{label}</span></td>
                      <td className="num">{money(Number(p.basePrice))}{p.isBulk ? '/lb' : ''}</td>
                      <td className="num">{p.isBulk ? `${Number(p.available)} lb` : Number(p.available)}</td>
                      <td>
                        <div className="row-actions" style={{ alignItems: 'flex-start' }}>
                          <PhotoForm productId={p.id} hasPhoto={!!photo} />
                          {p.photoOverride && p.photoOverride !== 'none' && (
                            <form action={resetProductPhoto}><input type="hidden" name="productId" value={p.id} /><button className="btn btn-ghost btn-sm" type="submit">{p.photoUrl ? 'Use store photo' : 'Remove'}</button></form>
                          )}
                          {!p.photoOverride && p.photoUrl && (
                            <form action={resetProductPhoto}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="mode" value="none" /><button className="btn btn-ghost btn-sm" type="submit" title="Wrong photo? Hide it">Wrong photo</button></form>
                          )}
                          {p.photoOverride === 'none' && (
                            <form action={resetProductPhoto}><input type="hidden" name="productId" value={p.id} /><button className="btn btn-ghost btn-sm" type="submit">Restore</button></form>
                          )}
                          <form action={toggleProductVisible}><input type="hidden" name="productId" value={p.id} /><button className="btn btn-ghost btn-sm" type="submit">{p.visible ? 'Hide' : 'Show'}</button></form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No products match.</p>}
        {products.length === 300 && <p className="muted">Showing the first 300. Search or pick a category to narrow it down.</p>}
      </section>
    </main>
  );
}
