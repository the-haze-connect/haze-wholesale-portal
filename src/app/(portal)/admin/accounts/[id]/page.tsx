import Link from 'next/link';
import { notFound } from 'next/navigation';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { STATUS_LABEL, fmtDate } from '@/lib/order-access';
import { BLOCKED_STATES } from '@/lib/rules';
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
  const approved = a.orders.filter(o => o.status === 'APPROVED');
  const portalSales = approved.reduce((s, o) => s + Number(o.subtotal), 0);
  const blocked = a.shipState && BLOCKED_STATES.includes(a.shipState);

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <p className="label"><Link href="/admin/accounts">Accounts</Link></p>
          <h1 className="display">{a.name}</h1>
          <p>{a.priceLevel?.name ?? 'Base price'} · {a.rep ? `${a.rep.name}${a.rep.commissioned ? '' : ' (house)'}` : 'House account'} · {a.shipState ?? 'No state on file'}{a.terms ? ` · ${a.terms}` : ''}</p>
        </div>
        {a.status === 'ACTIVE' && !blocked && <Link className="btn btn-kush" href={`/?for=${a.id}`}>Order for this shop</Link>}
      </div>

      {blocked && <p className="note-warn">This account’s ship-to state ({a.shipState}) is blocked, so it can’t order. Fix the address in Order Time if it’s wrong.</p>}

      <div className="two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
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
            <div className="panel-head"><h2 className="display">Portal orders</h2></div>
            {a.orders.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {a.orders.map(o => (
                      <tr key={o.id}>
                        <td><Link href={`/orders/${o.id}`}><b>#{o.id}</b></Link><span className="sub">{fmtDate(o.createdAt)}</span></td>
                        <td>{o.paymentMethod === 'CARD' ? 'Card' : 'ACH / wire'}</td>
                        <td><span className={`pill ${STATUS_LABEL[o.status]!.pill}`}>{STATUS_LABEL[o.status]!.text}</span></td>
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
