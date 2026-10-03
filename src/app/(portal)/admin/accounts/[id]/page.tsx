import Link from 'next/link';
import { notFound } from 'next/navigation';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { STATUS_LABEL, fmtDate, statusOf } from '@/lib/order-access';
import { BLOCKED_STATES, PRICE_LEVELS, COMMISSION } from '@/lib/rules';
import type { AccountProfile, ProfileAddress } from '@/lib/sync/profile';
import { removeLogin, setAccountStatus, setLoginAccess } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_TEXT = { ACTIVE: 'Active: can order', ON_HOLD: 'On hold: can sign in and browse, can’t order', CLOSED: 'Closed: can’t order', PENDING: 'Pending' } as const;

export default async function AccountAdmin({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const a = await db.account.findUnique({
    where: { id },
    include: { priceLevel: true, rep: true, users: { orderBy: { createdAt: 'asc' } }, orders: { orderBy: { createdAt: 'desc' }, take: 25 } },
  });
  if (!a) notFound();
  const [otCount, lastOt] = await Promise.all([
    db.otOrder.count({ where: { accountId: a.id } }),
    db.otOrder.findFirst({ where: { accountId: a.id }, orderBy: { date: 'desc' }, select: { date: true, docNo: true } }),
  ]);
  const approved = a.orders.filter(o => o.status === 'APPROVED');
  const portalSales = approved.reduce((s, o) => s + Number(o.subtotal), 0);
  const blocked = a.shipState && BLOCKED_STATES.includes(a.shipState);
  const p = (a.profile as AccountProfile | null) ?? null;
  const rule = a.priceLevel ? PRICE_LEVELS[a.priceLevel.name] : undefined;
  const tierMeaning = !a.priceLevel
    ? (a.otPriceLevel ? `Order Time has “${a.otPriceLevel}”, which the portal doesn’t honor, so this shop pays base prices.` : 'No price level in Order Time, so this shop pays base prices.')
    : rule?.kind === 'PERCENT_OFF' ? `${rule.percentOff}% off base price on every item.`
    : rule?.kind === 'ITEM_PRICE' ? 'Per-item prices from this level in Order Time; base price where an item has none.'
    : 'Base prices.';
  const commissionNote = !a.rep?.commissioned ? 'House account: no commission.'
    : `${a.rep.name} earns ${Math.round((rule?.tierGroup === 'DISTRO' ? COMMISSION.distroRate : COMMISSION.retailRate) * 100)}% of product subtotal; bulk flower by the pound.`;
  const addr = (x: ProfileAddress | null | undefined) => x && (
    <>
      {x.lines.map(l => <div key={l}>{l}</div>)}
      {x.contact && <div className="muted">Attn: {x.contact}</div>}
      {x.phone && <div><a href={`tel:${x.phone.replace(/[^\d+]/g, '')}`}>{x.phone}</a></div>}
      {x.email && <div><a href={`mailto:${x.email}`}>{x.email}</a></div>}
    </>
  );
  const row = (label: string, value: React.ReactNode) => value ? (
    <div className="sum-row" style={{ alignItems: 'flex-start' }}><span>{label}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{value}</span></div>
  ) : null;

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <p className="label"><Link href="/admin/accounts">Accounts</Link></p>
          <h1 className="display">{a.name}</h1>
          <p>{a.priceLevel?.name ?? 'Base price'} · {a.rep ? `${a.rep.name}${a.rep.commissioned ? '' : ' (house)'}` : 'House account'} · {[a.city, a.shipState].filter(Boolean).join(', ') || 'No state on file'}{a.terms ? ` · ${a.terms}` : ''}{p?.phone ? ` · ${p.phone}` : ''}</p>
        </div>
        {a.status === 'ACTIVE' && !blocked && <Link className="btn btn-kush" href={`/?for=${a.id}`}>Order for this shop</Link>}
      </div>

      {p?.onCreditHold && <p className="note-warn">This customer is on credit hold in Order Time.</p>}
      {blocked && <p className="note-warn">This account’s ship-to state ({a.shipState}) is blocked, so it can’t order. Fix the address in Order Time if it’s wrong.</p>}

      <div className="two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <section className="panel">
            <div className="panel-head"><h2 className="display">Order Time details</h2>{a.otCustomerId && <span className="muted">Customer {a.otCustomerId}</span>}</div>
            {p ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '4px 28px' }}>
                <div>
                  {row('Contact', p.contact)}
                  {row('Phone', p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>)}
                  {row('Other phone', p.altPhone && p.altPhone !== p.phone && <a href={`tel:${p.altPhone.replace(/[^\d+]/g, '')}`}>{p.altPhone}</a>)}
                  {row('Email', p.email && <a href={`mailto:${p.email}`}>{p.email}</a>)}
                  {row('Website', p.website && (/^https?:/i.test(p.website) ? <a href={p.website} target="_blank" rel="noreferrer">{p.website}</a> : p.website))}
                  {row('Ship to', addr(p.shipTo) ?? <span className="muted">None on file</span>)}
                  {row('Bill to', addr(p.billTo))}
                  {row('Shipping instructions', p.shippingInstructions)}
                </div>
                <div>
                  {row('Customer type', p.customerType)}
                  {row('Account #', p.accountNumber)}
                  {row('Terms', p.terms ?? a.terms)}
                  {row('Payment method', p.paymentMethod)}
                  {row('Ship method', p.shipMethod)}
                  {row('Credit limit', p.creditLimit !== null ? money(p.creditLimit) : null)}
                  {row('Credit hold', p.onCreditHold ? 'Yes' : null)}
                  {row('Hemp license #', a.licenseNumber ?? p.customFields.find(f => f.label === 'Hemp License #')?.value)}
                  {row('Tax registration #', p.taxRegistration)}
                  {row('Sales tax certificate', p.salesTaxCertificate)}
                  {row('Sales tax code', p.salesTaxCode)}
                  {p.customFields.filter(f => f.label !== 'Hemp License #').map(f => <div key={f.label}>{row(f.label, f.value)}</div>)}
                </div>
              </div>
            ) : <p className="muted">Details load with the next Order Time sync (within 5 minutes).</p>}
            {p?.note && <p style={{ marginTop: 14, marginBottom: 0 }}><span className="label">Order Time note</span><br /><span style={{ whiteSpace: 'pre-line' }}>{p.note}</span></p>}
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="display">Logins</h2><Link className="btn btn-ghost btn-sm" href="/invites">Invite a buyer</Link></div>
            {a.users.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Buyer</th><th>Access</th><th>Last sign-in</th><th><span className="sr">Actions</span></th></tr></thead>
                  <tbody>
                    {a.users.map(u => (
                      <tr key={u.id}>
                        <td><b>{u.name ?? u.email}</b><span className="sub">{u.email}</span></td>
                        <td>
                          <form action={setLoginAccess} style={{ display: 'flex', gap: 6 }}>
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="role" defaultValue={u.role} aria-label={`Access for ${u.email}`} style={{ font: 'inherit', minHeight: 36, borderRadius: 9, border: '1px solid var(--line-2)', padding: '0 8px' }}>
                              <option value="BUYER">Can order</option>
                              <option value="VIEW_ONLY">View only</option>
                            </select>
                            <button className="btn btn-ghost btn-sm" type="submit">Save</button>
                          </form>
                        </td>
                        <td>{u.lastLogin ? fmtDate(u.lastLogin) : <span className="muted">Never</span>}</td>
                        <td><div className="row-actions"><form action={removeLogin}><input type="hidden" name="userId" value={u.id} /><button className="btn btn-ghost btn-sm" type="submit" style={{ color: 'var(--red-ink)' }}>Remove</button></form></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty">No one at this shop has a login yet.</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="display">Portal orders</h2>
              <Link className="btn btn-ghost btn-sm" href={`/orders?account=${a.id}`}>Full order history ({otCount + a.orders.length > 0 ? `${otCount} in Order Time` : 'none yet'})</Link>
            </div>
            {lastOt && <p className="muted" style={{ margin: '0 0 10px', fontSize: 13.5 }}>Last Order Time sales order: <Link href={`/orders/ot/${lastOt.docNo}`}>SO {lastOt.docNo}</Link> on {lastOt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</p>}
            {a.orders.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {a.orders.map(o => (
                      <tr key={o.id}>
                        <td><Link href={`/orders/${o.id}`}><b>#{o.id}</b></Link><span className="sub">{fmtDate(o.createdAt)}</span></td>
                        <td>{o.paymentMethod === 'CARD' ? 'Card' : 'ACH / wire'}</td>
                        <td><span className={`pill ${statusOf(o).pill}`}>{statusOf(o).text}</span></td>
                        <td className="num"><b>{money(Number(o.total))}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty">No portal orders yet.</p>}
          </section>
        </div>

        <aside className="rail">
          <section className="panel">
            <p className="label">Ordering status</p>
            <form action={setAccountStatus} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <input type="hidden" name="id" value={a.id} />
              {(['ACTIVE', 'ON_HOLD', 'CLOSED'] as const).map(s => (
                <label key={s} className="check"><input type="radio" name="status" value={s} defaultChecked={a.status === s} /> {STATUS_TEXT[s]}</label>
              ))}
              <button className="btn btn-dark" type="submit">Save status</button>
            </form>
          </section>
          <section className="panel">
            <p className="label">Pricing and commission</p>
            <p style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 700 }}>{a.priceLevel?.name ?? 'Base price'}</p>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>{tierMeaning}</p>
            <div className="sum-row" style={{ marginTop: 10 }}><span>Rep</span><b>{a.rep?.name ?? 'House'}</b></div>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>{commissionNote}</p>
            <Link className="btn btn-ghost btn-sm" href={`/?for=${a.id}`}>See this shop’s prices</Link>
          </section>
          <section className="panel">
            <p className="label">At a glance</p>
            <div className="stats">
              <div className="stat"><small>Portal sales</small><strong>{money(portalSales)}</strong></div>
              <div className="stat"><small>Approved orders</small><strong>{approved.length}</strong></div>
              <div className="stat"><small>Waiting on payment</small><strong>{a.orders.filter(o => o.status === 'SUBMITTED').length}</strong></div>
              <div className="stat"><small>Order Time ID</small><strong>{a.otCustomerId ?? '—'}</strong></div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Change the tier, rep, terms or address in Order Time. The portal picks it up within 5 minutes.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
