import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { money } from '@/components/format';
import { Thumb } from '@/components/thumb';
import { effectivePhoto } from '@/lib/catalog';
import { db } from '@/lib/db';
import { sampleLimit } from '@/lib/orders';
import { resetProductPhoto, toggleProductVisible, toggleSample } from './actions';
import { PhotoForm, SampleLimitForm } from './photo-form';

export const dynamic = 'force-dynamic';

const SHOW = [['instock', 'In stock'], ['nophoto', 'In stock, no photo'], ['samples', 'Free samples'], ['singles', 'Singles & sample SKUs'], ['all', 'All cases'], ['hidden', 'Hidden from portal']] as const;
const CATEGORIES = ['Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower', 'Samples'];
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
    ...(show === 'instock' ? { wholesale: true, visible: true, available: { gt: 0 } } :
      show === 'nophoto' ? { wholesale: true, visible: true, available: { gt: 0 }, AND: [noPhoto] } :
      show === 'samples' ? { sampleOffered: true } :
      show === 'singles' ? { wholesale: false } :
      show === 'hidden' ? { wholesale: true, visible: false } : { wholesale: true }),
  };

  const [products, inStock, inStockNoPhoto] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 300 }),
    db.product.count({ where: { active: true, wholesale: true, visible: true, available: { gt: 0 } } }),
    db.product.count({ where: { active: true, wholesale: true, visible: true, available: { gt: 0 }, AND: [noPhoto] } }),
  ]);
  const [samplesOffered, limit] = await Promise.all([db.product.count({ where: { active: true, sampleOffered: true, available: { gte: 1 } } }), sampleLimit()]);
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
        <div className="kpi"><small>Free samples offered (in stock)</small><strong>{samplesOffered}</strong></div>
      </div>

      <section className="panel" style={{ display: 'flex', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: '62ch' }}>
          <p className="label">Free samples</p>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>Buyers see a Free samples section on the home page and can add samples to a case order at no charge. To offer an item, open <Link href="/admin/products?show=singles">Singles &amp; sample SKUs</Link> (or any case) and click <b>Offer as sample</b>.</p>
        </div>
        <SampleLimitForm initial={limit} />
      </section>

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
                          <div><b>{p.name}</b><span className="sub">{p.code} · {p.category}{!p.wholesale ? ' · single / sample' : ''}{!p.visible ? ' · hidden' : ''}</span>{p.sampleOffered && <span className="pill pill-in" style={{ marginTop: 4, display: 'inline-block' }}>Free sample</span>}</div>
                        </div>
                      </td>
                      <td><span className={`pill ${photo ? 'pill-in' : 'pill-low'}`}>{label}</span></td>
                      <td className="num">{p.wholesale ? <>{money(Number(p.basePrice))}{p.isBulk ? '/lb' : ''}</> : <span className="muted">{money(Number(p.basePrice))}</span>}</td>
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
                          <form action={toggleSample}><input type="hidden" name="productId" value={p.id} /><button className="btn btn-ghost btn-sm" type="submit">{p.sampleOffered ? 'Stop sample' : 'Offer as sample'}</button></form>
                          {p.wholesale && <form action={toggleProductVisible}><input type="hidden" name="productId" value={p.id} /><button className="btn btn-ghost btn-sm" type="submit">{p.visible ? 'Hide' : 'Show'}</button></form>}
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
