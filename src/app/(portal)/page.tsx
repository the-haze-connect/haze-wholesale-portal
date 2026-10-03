import Link from 'next/link';
import { AnnouncementFeed } from '@/components/announcements';
import { CartBar } from '@/components/cart-bar';
import { CatalogGrid } from '@/components/catalog-grid';
import { RepAccountPicker } from '@/components/rep-picker';
import { getAnnouncements } from '@/lib/announcements';
import { getCatalog } from '@/lib/catalog';
import { shopContext } from '@/lib/context';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ctx = await shopContext(user, sp);
  const cat = typeof sp.cat === 'string' ? sp.cat : undefined;
  const [items, announcements] = await Promise.all([getCatalog(ctx.level), getAnnouncements()]);
  const pinned = announcements.find(a => a.pinned);
  const inStock = items.filter(i => i.stock !== 'out').length;

  return (
    <main className="wrap">
      {user.role === 'REP' && <RepAccountPicker accounts={ctx.repAccounts} selected={ctx.account?.id ?? null} />}
      {user.role === 'ADMIN' && ctx.account && <RepAccountPicker accounts={[{ id: ctx.account.id, name: ctx.account.name }]} selected={ctx.account.id} admin />}

      {pinned && (
        <section className="hero" aria-label="Pinned announcement">
          <div className="hero-copy">
            <div className="meta"><span className="tag-solid">{pinned.type === 'DEAL' ? 'Deal' : pinned.type === 'DELAY' ? 'Delay/Back Order' : 'News'}</span><span>Pinned{pinned.endsAt ? ` · ends ${pinned.endsAt}` : ''}</span></div>
            <h2 className="display">{pinned.title}</h2>
            <p>{pinned.body}</p>
          </div>
          {pinned.ctaLabel ? <div style={{ position: 'relative', zIndex: 1 }}><a className="btn btn-gold" href={pinned.ctaCategory ? `${ctx.carry ? `${ctx.carry}&` : '?'}cat=${encodeURIComponent(pinned.ctaCategory)}#shop` : '#shop'}>{pinned.ctaLabel}</a></div> : null}
        </section>
      )}

      <div className="two">
        <AnnouncementFeed items={announcements} />
        <aside className="rail" aria-label="Account">
          <div className="panel">
            <p className="label">{user.role === 'ADMIN' ? 'Admin preview' : user.role === 'REP' ? 'Ordering for' : 'Welcome back'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700 }}>
              {user.role === 'ADMIN' ? (ctx.level ?? 'Base price') : ctx.account?.name ?? (user.role === 'REP' ? 'Pick a shop above' : user.email)}
            </p>
            <div className="stats">
              <div className="stat"><small>Price tier</small><strong>{ctx.level ?? 'Base price'}</strong></div>
              <div className="stat"><small>Payment</small><strong>Card or ACH/wire</strong></div>
              <div className="stat"><small>Products in stock</small><strong>{inStock}</strong></div>
              <div className="stat"><small>Ships from</small><strong>Our warehouse</strong></div>
            </div>
          </div>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label">Restocking?</p>
            <p style={{ margin: 0, color: 'var(--ink-2)' }}>Type case counts down one list instead of browsing.</p>
            <Link className="btn btn-dark" href={`/quick-order${ctx.carry}`}>Open quick order</Link>
          </div>
        </aside>
      </div>

      <section id="shop" aria-labelledby="shop-h" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-head">
          <div>
            <h2 className="display" id="shop-h" style={{ margin: 0, fontSize: 'clamp(24px, 3vw, 30px)' }}>Shop available inventory</h2>
            <p>Case and display quantities, live from our warehouse. Prices shown are {user.role === 'BUYER' ? 'your' : 'this account’s'} tier price.</p>
          </div>
        </div>
        {items.length ? <CatalogGrid key={cat ?? 'All'} items={items} canOrder={ctx.canOrder} initialCategory={cat} /> : <p className="empty">The catalog is empty. Run the Order Time sync to load products.</p>}
      </section>
      <CartBar carry={ctx.carry} />
    </main>
  );
}
