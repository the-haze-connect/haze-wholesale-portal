import Link from 'next/link';
import { AnnouncementFeed } from '@/components/announcements';
import { CartBar } from '@/components/cart-bar';
import { CatalogGrid } from '@/components/catalog-grid';
import { RepAccountPicker } from '@/components/rep-picker';
import { SamplesSection } from '@/components/samples';
import { getAnnouncements } from '@/lib/announcements';
import { sampleLimit } from '@/lib/orders';
import { getSamples } from '@/lib/samples';
import { getCatalog } from '@/lib/catalog';
import { shopContext } from '@/lib/context';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { reorderPlan, reorderPlanForOt } from '@/lib/reorder';
import type { OtLine } from '@/lib/sync/ot-orders';
import { ReorderButton } from '@/components/reorder-button';
import { money } from '@/components/format';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ctx = await shopContext(user, sp);
  const cat = typeof sp.cat === 'string' ? sp.cat : undefined;
  const [items, announcements, samples, limit] = await Promise.all([getCatalog(ctx.level), getAnnouncements(), getSamples(), sampleLimit()]);
  const pinned = announcements.find(a => a.pinned);
  const lastOrder = ctx.account && ctx.canOrder
    ? await db.order.findFirst({ where: { accountId: ctx.account.id, status: { in: ['APPROVED', 'SUBMITTED'] } }, orderBy: { createdAt: 'desc' } })
    : null;
  // The newest Order Time sales order with items loaded, if it's newer than the last portal order
  const lastOt = ctx.account && ctx.canOrder
    ? await db.otOrder.findFirst({
        where: { accountId: ctx.account.id, portalOrderId: null, linesAt: { not: null }, NOT: { status: { contains: 'void', mode: 'insensitive' } }, ...(lastOrder ? { date: { gt: lastOrder.createdAt } } : {}) },
        orderBy: [{ date: 'desc' }, { docNo: 'desc' }],
      })
    : null;
  const reorder = lastOt
    ? await reorderPlanForOt((lastOt.lines as OtLine[] | null) ?? [], ctx.account!.id)
    : lastOrder ? await reorderPlan(lastOrder.id) : null;
  const last = lastOt
    ? { href: `/orders/ot/${lastOt.docNo}`, label: `SO ${lastOt.docNo}`, date: lastOt.date, tz: 'UTC', total: lastOt.total === null ? null : Number(lastOt.total) }
    : lastOrder ? { href: `/orders/${lastOrder.id}`, label: `#${lastOrder.id}`, date: lastOrder.createdAt, tz: 'America/Chicago', total: Number(lastOrder.subtotal) } : null;
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
          {last && reorder && (
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="label">Your last order</p>
              <p style={{ margin: 0 }}><Link href={last.href}><b>{last.label}</b></Link> · {last.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(last.date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), timeZone: last.tz })}{last.total !== null ? ` · ${money(last.total)}` : ''} · {reorder.lines.length + reorder.skipped.length} item{reorder.lines.length + reorder.skipped.length === 1 ? '' : 's'}</p>
              <ReorderButton lines={reorder.lines} skipped={reorder.skipped} cartHref={`/cart${ctx.carry}`} label="Reorder" kind="kush" />
            </div>
          )}
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
      <SamplesSection samples={samples} limit={limit} canOrder={ctx.canOrder} />
      <CartBar carry={ctx.carry} />
    </main>
  );
}
