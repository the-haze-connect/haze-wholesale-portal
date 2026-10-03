import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { money } from '@/components/format';
import { Thumb } from '@/components/thumb';
import { ReorderButton } from '@/components/reorder-button';
import { effectivePhoto } from '@/lib/catalog';
import { db } from '@/lib/db';
import { fmtDay, otOrderScope, otStatus } from '@/lib/order-access';
import { reorderPlanForOt } from '@/lib/reorder';
import { requireUser } from '@/lib/session';
import { shipmentsForOrderNumber, shipmentsForSalesOrder, shipstationConfigured, toTracking, type Tracking } from '@/lib/shipstation';
import { loadOtOrderLines, type OtLine } from '@/lib/sync/ot-orders';

export const dynamic = 'force-dynamic';

const HOUR = 3600_000;

export default async function OtOrderPage({ params, searchParams }: { params: Promise<{ docNo: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const docNo = Number((await params).docNo);
  if (!Number.isInteger(docNo)) notFound();
  const refresh = (await searchParams).refresh === '1' && user.role === 'ADMIN';

  let order = await db.otOrder.findFirst({ where: { AND: [{ docNo }, await otOrderScope(user)] }, include: { account: true } });
  if (!order) notFound();
  if (order.portalOrderId) redirect(`/orders/${order.portalOrderId}`);

  // Line items: loaded from Order Time the first time anyone opens the order (or on refresh)
  let loadError: string | null = null;
  if (!order.linesAt || refresh) {
    try {
      await loadOtOrderLines(db, docNo);
      order = (await db.otOrder.findUnique({ where: { docNo }, include: { account: true } }))!;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      console.error(`[orders] SO ${docNo}:`, loadError);
    }
  }

  // Tracking from ShipStation: checked at most hourly, only for orders from the last six months
  let tracking = (order.tracking as Tracking[] | null) ?? [];
  const recent = Date.now() - order.date.getTime() < 183 * 24 * HOUR;
  if (!tracking.length && recent && shipstationConfigured() && (!order.trackingAt || Date.now() - order.trackingAt.getTime() > HOUR || refresh)) {
    try {
      tracking = shipmentsForSalesOrder(await shipmentsForOrderNumber(String(docNo)), docNo).map(toTracking);
      await db.otOrder.update({ where: { docNo }, data: { tracking: tracking.length ? tracking as object[] : undefined, trackingAt: new Date() } });
    } catch (err) {
      console.error(`[orders] ShipStation SO ${docNo}:`, err instanceof Error ? err.message : err);
    }
  }

  const lines = (order.lines as OtLine[] | null) ?? [];
  const ids = [...new Set(lines.map(l => l.itemId).filter((x): x is number => x !== null))];
  const products = ids.length ? await db.product.findMany({ where: { otItemId: { in: ids } } }) : [];
  const byItem = new Map(products.map(p => [p.otItemId, p]));
  const itemsTotal = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const status = otStatus(order.status, tracking.length > 0);

  const canReorder = user.role !== 'VIEW_ONLY' && order.account?.status === 'ACTIVE' && lines.length > 0 && !/void|cancel/i.test(order.status ?? '');
  const plan = canReorder ? await reorderPlanForOt(lines, order.account!.id) : null;
  const cartHref = user.role === 'BUYER' ? '/cart' : `/cart?for=${order.accountId}`;
  const shop = order.account?.name ?? `Order Time customer ${order.otCustomerId}`;

  return (
    <main className="wrap">
      <p style={{ margin: '0 0 8px' }}><Link href="/orders">← All orders</Link></p>
      <div className="page-head">
        <div>
          <h1 className="display">Sales order {order.docNo}</h1>
          <p>{shop} · {fmtDay(order.date)}{order.customerPO ? ` · PO ${order.customerPO}` : ''}{order.repName ? ` · Rep ${order.repName}` : ''}</p>
        </div>
        <span className={`pill ${status.pill}`} style={{ fontSize: 14 }}>{status.text}</span>
      </div>

      <div className="two">
        <section className="panel">
          <div className="panel-head"><h2 className="display">Items</h2></div>
          {loadError && !lines.length ? (
            <p className="note-warn">Couldn’t load the items from Order Time just now. Try again in a minute.</p>
          ) : lines.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {lines.map((l, i) => {
                    const p = l.itemId !== null ? byItem.get(l.itemId) : undefined;
                    const free = l.price === 0;
                    return (
                      <tr key={i}>
                        <td>
                          <div className="with-thumb">
                            <Thumb src={p ? effectivePhoto(p.photoOverride, p.photoUrl) : null} category={p?.category ?? 'Other'} />
                            <div><b>{p?.name ?? (l.description || l.code)}</b><span className="sub">{[l.uom && l.uom !== 'EA' ? l.uom : null, l.code].filter(Boolean).join(' · ')}</span></div>
                          </div>
                        </td>
                        <td className="num">{free ? 'Free' : money(l.price)}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num"><b>{free ? 'Free' : money(l.quantity * l.price)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No items on this sales order.</p>}
        </section>

        <aside className="rail">
          <section className="panel">
            <p className="label">Summary</p>
            {lines.length > 0 && <div className="sum-row"><span>Items</span><b>{money(itemsTotal)}</b></div>}
            <div className="sum-row"><span>Shipping{order.shipMethod && <span className="sub">{order.shipMethod}</span>}</span><b>{order.shipAmount ? money(Number(order.shipAmount)) : 'Free'}</b></div>
            {order.total !== null && <div className="sum-row"><span>Total</span><b>{money(Number(order.total))}</b></div>}
            {order.promiseDate && <div className="sum-row"><span>Promised</span><b>{fmtDay(order.promiseDate)}</b></div>}
          </section>

          {tracking.length > 0 && (
            <section className="panel">
              <p className="label">Shipped{tracking[0]?.shipDate ? ` ${fmtDay(new Date(tracking[0].shipDate))}` : ''}</p>
              {tracking.map(t => (
                <div key={t.number} className="sum-row">
                  <span>{t.carrier}{t.service && <span className="sub">{t.service}</span>}</span>
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer"><b>{t.number}</b></a> : <b>{t.number}</b>}
                </div>
              ))}
            </section>
          )}

          {plan && (
            <section className="panel">
              <p className="label">Order these again</p>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '6px 0 12px' }}>Adds the same items to the cart at today’s prices, up to what’s in stock.</p>
              <ReorderButton lines={plan.lines} skipped={plan.skipped} cartHref={cartHref} label="Reorder these items" />
            </section>
          )}

          {user.role === 'ADMIN' && (
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="label">Admin</p>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>Imported from Order Time{order.linesAt ? ` · items loaded ${fmtDay(order.linesAt)}` : ''}</p>
              {order.account && <Link className="btn btn-ghost btn-sm" href={`/admin/accounts/${order.account.id}`}>Open account</Link>}
              <Link className="btn btn-ghost btn-sm" href={`/orders/ot/${order.docNo}?refresh=1`}>Reload from Order Time</Link>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
